
import logging
from pathlib import Path
from typing import Literal
from uuid import UUID

from dotenv import load_dotenv

load_dotenv(
    dotenv_path=Path(__file__).resolve().parent / ".env",
    override=False,
)

from fastapi import (
    BackgroundTasks,
    Depends,
    FastAPI,
    HTTPException,
)
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.orm import Session

from database import engine
from auth import get_current_user
from ai_routes import router as ai_router
from ai_submission_routes import router as ai_submission_router
from approvals_routes import router as approvals_router
from workflows_routes import router as workflows_router
from workflow_engine import dispatch_workflow_event


logger = logging.getLogger("opspilot.api")


app = FastAPI(
    title="OpsPilot API",
    description="Backend API for OpsPilot AI Business Operations Platform",
    version="1.5.0",
)


# --------------------------------------------------
# CORS
# --------------------------------------------------

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
    ],
    allow_credentials=False,
    allow_methods=[
        "GET",
        "POST",
        "PUT",
        "PATCH",
        "DELETE",
        "OPTIONS",
    ],
    allow_headers=[
        "Content-Type",
        "Authorization",
    ],
)


# --------------------------------------------------
# PROTECTED ROUTERS
# --------------------------------------------------

auth_required = [Depends(get_current_user)]

app.include_router(
    ai_router,
    dependencies=auth_required,
)

app.include_router(
    ai_submission_router,
    dependencies=auth_required,
)

app.include_router(
    workflows_router,
    dependencies=auth_required,
)

app.include_router(
    approvals_router,
    dependencies=auth_required,
)


# --------------------------------------------------
# TYPES
# --------------------------------------------------

Priority = Literal[
    "Low",
    "Medium",
    "High",
]

TaskStatus = Literal[
    "Pending",
    "In Progress",
    "Completed",
]


# --------------------------------------------------
# REQUEST MODELS
# --------------------------------------------------

class TaskCreate(BaseModel):
    title: str = Field(
        min_length=1,
        max_length=200,
    )
    description: str | None = None
    owner: str = "Operations"
    priority: Priority = "Medium"


class TaskUpdate(BaseModel):
    title: str | None = Field(
        default=None,
        min_length=1,
        max_length=200,
    )
    description: str | None = None
    owner: str | None = None
    priority: Priority | None = None
    status: TaskStatus | None = None


# --------------------------------------------------
# DATABASE
# --------------------------------------------------

def get_db():
    with Session(engine) as session:
        yield session


# --------------------------------------------------
# AUTHENTICATED USER ID
# --------------------------------------------------

def get_authenticated_user_id(
    current_user: dict = Depends(get_current_user),
) -> UUID:
    """
    Extract the verified Supabase user ID.

    Never accept ownership from request body,
    query parameters, or frontend-provided IDs.
    """

    try:
        return UUID(current_user["sub"])
    except (KeyError, TypeError, ValueError):
        raise HTTPException(
            status_code=401,
            detail="Invalid authenticated user identity",
        )


# --------------------------------------------------
# ACTIVITY LOGGING
# --------------------------------------------------

def add_activity_log(
    db: Session,
    task_id: UUID,
    action: str,
    description: str,
    user_id: UUID,
    actor: str = "Workspace Admin",
):
    """
    Add an activity log in the current transaction.

    The calling endpoint handles the commit.
    """

    db.execute(
        text("""
            INSERT INTO public.activity_logs (
                task_id,
                action,
                description,
                actor,
                user_id
            )
            VALUES (
                :task_id,
                :action,
                :description,
                :actor,
                :user_id
            )
        """),
        {
            "task_id": task_id,
            "action": action,
            "description": description,
            "actor": actor,
            "user_id": user_id,
        },
    )


# --------------------------------------------------
# AUTOMATIC WORKFLOW DISPATCH
# --------------------------------------------------

def dispatch_task_created_event(
    task_id: UUID,
    task_data: dict,
    user_id: UUID,
):
    """
    Run task_created workflows after task commit.

    A failed workflow must not undo a task
    that was already saved successfully.
    """

    try:
        payload = {
            "task_id": str(task_id),
            "task": task_data,
            "source": "opspilot_api",
            "actor": "Workspace Admin",
        }

        summary = dispatch_workflow_event(
            trigger="task_created",
            event_id=task_id,
            payload=payload,
            user_id=user_id,
        )

        logger.info(
            "Task-created workflows dispatched. "
            "Task=%s User=%s Summary=%s",
            task_id,
            user_id,
            summary,
        )

    except Exception:
        logger.exception(
            "Failed to dispatch task-created workflows "
            "for task %s",
            task_id,
        )


# --------------------------------------------------
# PUBLIC ROOT
# --------------------------------------------------

@app.get("/")
def root():
    return {
        "message": "Welcome to OpsPilot API",
        "status": "running",
    }


# --------------------------------------------------
# PUBLIC HEALTH
# --------------------------------------------------

@app.get("/api/health")
def health_check():
    return {
        "status": "healthy",
        "service": "OpsPilot Backend",
        "version": "1.5.0",
    }


# --------------------------------------------------
# LIST TASKS
# --------------------------------------------------

@app.get(
    "/api/tasks",
    dependencies=auth_required,
)
def get_tasks(
    db: Session = Depends(get_db),
    user_id: UUID = Depends(get_authenticated_user_id),
):
    result = db.execute(
        text("""
            SELECT *
            FROM public.tasks
            WHERE user_id = :user_id
            ORDER BY created_at DESC
        """),
        {
            "user_id": user_id,
        },
    )

    return [
        dict(row)
        for row in result.mappings().all()
    ]


# --------------------------------------------------
# CREATE TASK + AUTOMATIC TRIGGER
# --------------------------------------------------

@app.post(
    "/api/tasks",
    status_code=201,
    dependencies=auth_required,
)
def create_task(
    task: TaskCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    user_id: UUID = Depends(get_authenticated_user_id),
):
    """
    1. Create a task owned by the authenticated user.
    2. Record activity with the same owner.
    3. Commit transaction.
    4. Schedule the owner's matching workflows.
    """

    try:
        result = db.execute(
            text("""
                INSERT INTO public.tasks (
                    title,
                    description,
                    owner,
                    priority,
                    user_id
                )
                VALUES (
                    :title,
                    :description,
                    :owner,
                    :priority,
                    :user_id
                )
                RETURNING *
            """),
            {
                **task.model_dump(),
                "user_id": user_id,
            },
        )

        created = dict(
            result.mappings().one()
        )

        add_activity_log(
            db=db,
            task_id=created["id"],
            action="TASK_CREATED",
            description=(
                f'Task "{created["title"]}" was created.'
            ),
            user_id=user_id,
        )

        db.commit()

    except Exception:
        db.rollback()
        logger.exception(
            "Failed to create task."
        )
        raise

    background_tasks.add_task(
        dispatch_task_created_event,
        created["id"],
        {
            "id": str(created["id"]),
            "title": created["title"],
            "description": created["description"],
            "owner": created["owner"],
            "priority": created["priority"],
            "status": created["status"],
        },
        user_id,
    )

    logger.info(
        "Task created. ID=%s User=%s. "
        "Automatic event scheduled.",
        created["id"],
        user_id,
    )

    return created


# --------------------------------------------------
# UPDATE TASK
# --------------------------------------------------

@app.patch(
    "/api/tasks/{task_id}",
    dependencies=auth_required,
)
def update_task(
    task_id: UUID,
    task: TaskUpdate,
    db: Session = Depends(get_db),
    user_id: UUID = Depends(get_authenticated_user_id),
):
    changes = task.model_dump(
        exclude_unset=True
    )

    if not changes:
        raise HTTPException(
            status_code=400,
            detail="No changes provided",
        )

    for field in (
        "title",
        "owner",
        "priority",
        "status",
    ):
        if (
            field in changes
            and changes[field] is None
        ):
            raise HTTPException(
                status_code=422,
                detail=f"{field} cannot be null",
            )

    allowed_fields = {
        "title",
        "description",
        "owner",
        "priority",
        "status",
    }

    if not set(changes).issubset(allowed_fields):
        raise HTTPException(
            status_code=422,
            detail="Invalid task fields",
        )

    try:
        existing_result = db.execute(
            text("""
                SELECT *
                FROM public.tasks
                WHERE id = :task_id
                  AND user_id = :user_id
                FOR UPDATE
            """),
            {
                "task_id": task_id,
                "user_id": user_id,
            },
        )

        existing = (
            existing_result
            .mappings()
            .one_or_none()
        )

        if existing is None:
            raise HTTPException(
                status_code=404,
                detail="Task not found",
            )

        old_task = dict(existing)

        assignments = ", ".join(
            f"{field} = :{field}"
            for field in changes
        )

        parameters = {
            **changes,
            "task_id": task_id,
            "user_id": user_id,
        }

        result = db.execute(
            text(f"""
                UPDATE public.tasks
                SET {assignments},
                    updated_at = NOW()
                WHERE id = :task_id
                  AND user_id = :user_id
                RETURNING *
            """),
            parameters,
        )

        updated = dict(
            result.mappings().one()
        )

        changed_fields = []

        for field in changes:
            old_value = old_task.get(field)
            new_value = updated.get(field)

            if old_value != new_value:
                changed_fields.append(
                    f"{field}: "
                    f"{old_value if old_value is not None else 'None'}"
                    f" → "
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
                description=description,
                user_id=user_id,
            )

        db.commit()

        return updated

    except Exception:
        db.rollback()
        raise


# --------------------------------------------------
# DELETE TASK
# --------------------------------------------------

@app.delete(
    "/api/tasks/{task_id}",
    status_code=204,
    dependencies=auth_required,
)
def delete_task(
    task_id: UUID,
    db: Session = Depends(get_db),
    user_id: UUID = Depends(get_authenticated_user_id),
):
    try:
        result = db.execute(
            text("""
                DELETE FROM public.tasks
                WHERE id = :task_id
                  AND user_id = :user_id
                RETURNING id, title
            """),
            {
                "task_id": task_id,
                "user_id": user_id,
            },
        )

        deleted = (
            result.mappings().one_or_none()
        )

        if deleted is None:
            raise HTTPException(
                status_code=404,
                detail="Task not found",
            )

        add_activity_log(
            db=db,
            task_id=deleted["id"],
            action="TASK_DELETED",
            description=(
                f'Task "{deleted["title"]}" was deleted.'
            ),
            user_id=user_id,
        )

        db.commit()

        return None

    except Exception:
        db.rollback()
        raise


# --------------------------------------------------
# ACTIVITY LOGS
# --------------------------------------------------

@app.get(
    "/api/activity-logs",
    dependencies=auth_required,
)
def get_activity_logs(
    limit: int = 50,
    db: Session = Depends(get_db),
    user_id: UUID = Depends(get_authenticated_user_id),
):
    if limit < 1 or limit > 100:
        raise HTTPException(
            status_code=422,
            detail="Limit must be between 1 and 100",
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
            WHERE user_id = :user_id
            ORDER BY created_at DESC, id DESC
            LIMIT :limit
        """),
        {
            "user_id": user_id,
            "limit": limit,
        },
    )

    return [
        dict(row)
        for row in result.mappings().all()
    ]
