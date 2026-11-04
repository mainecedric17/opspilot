
from datetime import datetime
from typing import Literal
from uuid import UUID

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.orm import Session

from database import engine


app = FastAPI(
    title="OpsPilot API",
    description="Backend API for OpsPilot AI Business Operations Platform",
    version="1.1.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    allow_headers=["Content-Type", "Authorization"],
)


Priority = Literal["Low", "Medium", "High"]
TaskStatus = Literal["Pending", "In Progress", "Completed"]


class TaskCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: str | None = None
    owner: str = "Operations"
    priority: Priority = "Medium"


class TaskUpdate(BaseModel):
    title: str | None = Field(
        default=None,
        min_length=1,
        max_length=200
    )
    description: str | None = None
    owner: str | None = None
    priority: Priority | None = None
    status: TaskStatus | None = None


def get_db():
    with Session(engine) as session:
        yield session


def add_activity_log(
    db: Session,
    task_id: UUID,
    action: str,
    description: str,
    actor: str = "Workspace Admin"
):
    """
    Add an activity record within the current transaction.

    This function intentionally does not commit.
    The calling endpoint commits both the task change
    and the activity log together.
    """
    db.execute(
        text("""
            INSERT INTO public.activity_logs (
                task_id,
                action,
                description,
                actor
            )
            VALUES (
                :task_id,
                :action,
                :description,
                :actor
            )
        """),
        {
            "task_id": task_id,
            "action": action,
            "description": description,
            "actor": actor
        }
    )


@app.get("/")
def root():
    return {
        "message": "Welcome to OpsPilot API",
        "status": "running"
    }


@app.get("/api/health")
def health_check():
    return {
        "status": "healthy",
        "service": "OpsPilot Backend",
        "version": "1.1.0"
    }


@app.get("/api/tasks")
def get_tasks(db: Session = Depends(get_db)):
    result = db.execute(
        text("""
            SELECT *
            FROM public.tasks
            ORDER BY created_at DESC
        """)
    )

    return [
        dict(row)
        for row in result.mappings().all()
    ]


@app.post("/api/tasks", status_code=201)
def create_task(
    task: TaskCreate,
    db: Session = Depends(get_db)
):
    try:
        result = db.execute(
            text("""
                INSERT INTO public.tasks (
                    title,
                    description,
                    owner,
                    priority
                )
                VALUES (
                    :title,
                    :description,
                    :owner,
                    :priority
                )
                RETURNING *
            """),
            task.model_dump()
        )

        created = dict(result.mappings().one())

        add_activity_log(
            db=db,
            task_id=created["id"],
            action="TASK_CREATED",
            description=f'Task "{created["title"]}" was created.'
        )

        db.commit()

        return created

    except Exception:
        db.rollback()
        raise


@app.patch("/api/tasks/{task_id}")
def update_task(
    task_id: UUID,
    task: TaskUpdate,
    db: Session = Depends(get_db)
):
    changes = task.model_dump(exclude_unset=True)

    if not changes:
        raise HTTPException(
            status_code=400,
            detail="No changes provided"
        )

    for field in ("title", "owner", "priority", "status"):
        if field in changes and changes[field] is None:
            raise HTTPException(
                status_code=422,
                detail=f"{field} cannot be null"
            )

    allowed_fields = {
        "title",
        "description",
        "owner",
        "priority",
        "status"
    }

    if not set(changes).issubset(allowed_fields):
        raise HTTPException(
            status_code=422,
            detail="Invalid task fields"
        )

    try:
        existing_result = db.execute(
            text("""
                SELECT *
                FROM public.tasks
                WHERE id = :task_id
                FOR UPDATE
            """),
            {"task_id": task_id}
        )

        existing = existing_result.mappings().one_or_none()

        if existing is None:
            raise HTTPException(
                status_code=404,
                detail="Task not found"
            )

        old_task = dict(existing)

        assignments = ", ".join(
            f"{field} = :{field}"
            for field in changes
        )

        parameters = {
            **changes,
            "task_id": task_id
        }

        result = db.execute(
            text(f"""
                UPDATE public.tasks
                SET {assignments},
                    updated_at = NOW()
                WHERE id = :task_id
                RETURNING *
            """),
            parameters
        )

        updated = dict(result.mappings().one())

        changed_fields = []

        for field in changes:
            old_value = old_task.get(field)
            new_value = updated.get(field)

            if old_value != new_value:
                changed_fields.append(
                    f"{field}: {old_value if old_value is not None else 'None'} → "
                    f"{new_value if new_value is not None else 'None'}"
                )

        if changed_fields:
            if (
                len(changed_fields) == 1
                and "status" in changes
                and old_task["status"] != updated["status"]
            ):
                action = "TASK_STATUS_CHANGED"
            else:
                action = "TASK_UPDATED"

            description = (
                f'Task "{updated["title"]}" updated. '
                + "; ".join(changed_fields)
            )

            add_activity_log(
                db=db,
                task_id=task_id,
                action=action,
                description=description
            )

        db.commit()

        return updated

    except Exception:
        db.rollback()
        raise


@app.delete("/api/tasks/{task_id}", status_code=204)
def delete_task(
    task_id: UUID,
    db: Session = Depends(get_db)
):
    try:
        result = db.execute(
            text("""
                DELETE FROM public.tasks
                WHERE id = :task_id
                RETURNING id, title
            """),
            {"task_id": task_id}
        )

        deleted = result.mappings().one_or_none()

        if deleted is None:
            raise HTTPException(
                status_code=404,
                detail="Task not found"
            )

        add_activity_log(
            db=db,
            task_id=deleted["id"],
            action="TASK_DELETED",
            description=f'Task "{deleted["title"]}" was deleted.'
        )

        db.commit()

        return None

    except Exception:
        db.rollback()
        raise


@app.get("/api/activity-logs")
def get_activity_logs(
    limit: int = 50,
    db: Session = Depends(get_db)
):
    if limit < 1 or limit > 100:
        raise HTTPException(
            status_code=422,
            detail="Limit must be between 1 and 100"
        )

    result = db.execute(
        text("""
            SELECT
                id,
                task_id,
                action,
                description,
                actor,
                created_at
            FROM public.activity_logs
            ORDER BY created_at DESC, id DESC
            LIMIT :limit
        """),
        {"limit": limit}
    )

    return [
        dict(row)
        for row in result.mappings().all()
    ]
