
import json
import logging
from typing import Any, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import text
from sqlalchemy.orm import Session

from auth import get_current_user
from database import engine
from workflow_engine import validate_action


logger = logging.getLogger("opspilot.workflows")

router = APIRouter(
    prefix="/api/workflows",
    tags=["Workflows"],
)

TriggerType = Literal[
    "manual",
    "task_created",
    "approval_approved",
    "approval_rejected",
]

ActionType = Literal[
    "create_task",
    "log_event",
]


# --------------------------------------------------
# DATABASE AND AUTH
# --------------------------------------------------

def get_db():
    with Session(engine) as session:
        yield session


def get_user_id(
    current_user: dict = Depends(get_current_user),
) -> UUID:
    try:
        return UUID(current_user["sub"])
    except (KeyError, ValueError, TypeError):
        raise HTTPException(
            status_code=401,
            detail="Invalid authenticated user",
        )


def to_dict(row):
    return dict(row)


def owned_workflow(
    db: Session,
    workflow_id: UUID,
    user_id: UUID,
    lock: bool = False,
):
    query = """
        SELECT *
        FROM public.workflows
        WHERE id = :workflow_id
          AND user_id = :user_id
    """

    if lock:
        query += " FOR UPDATE"

    result = db.execute(
        text(query),
        {
            "workflow_id": workflow_id,
            "user_id": user_id,
        },
    ).mappings().one_or_none()

    if result is None:
        raise HTTPException(
            status_code=404,
            detail="Workflow not found",
        )

    return dict(result)


# --------------------------------------------------
# REQUEST MODELS
# --------------------------------------------------

class WorkflowCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: str | None = None
    trigger_type: TriggerType = "manual"
    action_type: ActionType = "log_event"
    configuration: dict[str, Any] = Field(
        default_factory=dict,
    )
    is_active: bool = False
    created_by: str = Field(
        default="Workspace Admin",
        min_length=1,
        max_length=150,
    )

    @field_validator("name", "created_by")
    @classmethod
    def validate_text(cls, value: str) -> str:
        value = value.strip()

        if not value:
            raise ValueError("Value cannot be blank")

        return value


class WorkflowUpdate(BaseModel):
    name: str | None = Field(
        default=None,
        min_length=1,
        max_length=200,
    )
    description: str | None = None
    trigger_type: TriggerType | None = None
    action_type: ActionType | None = None
    configuration: dict[str, Any] | None = None
    is_active: bool | None = None

    @field_validator("name")
    @classmethod
    def validate_name(cls, value):
        if value is not None:
            value = value.strip()

            if not value:
                raise ValueError("Name cannot be blank")

        return value


class WorkflowRunRequest(BaseModel):
    confirm: bool = False
    payload: dict[str, Any] = Field(
        default_factory=dict,
    )


# --------------------------------------------------
# LIST WORKFLOWS
# --------------------------------------------------

@router.get("")
def list_workflows(
    db: Session = Depends(get_db),
    user_id: UUID = Depends(get_user_id),
):
    result = db.execute(
        text("""
            SELECT *
            FROM public.workflows
            WHERE user_id = :user_id
            ORDER BY created_at DESC
        """),
        {"user_id": user_id},
    )

    return [
        to_dict(row)
        for row in result.mappings().all()
    ]


# --------------------------------------------------
# CREATE WORKFLOW
# --------------------------------------------------

@router.post("", status_code=201)
def create_workflow(
    workflow: WorkflowCreate,
    db: Session = Depends(get_db),
    user_id: UUID = Depends(get_user_id),
):
    data = workflow.model_dump()

    try:
        validate_action(
            data["action_type"],
            data["configuration"],
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=422,
            detail=str(exc),
        )

    data["configuration"] = json.dumps(
        data["configuration"]
    )
    data["user_id"] = user_id

    try:
        result = db.execute(
            text("""
                INSERT INTO public.workflows (
                    name,
                    description,
                    trigger_type,
                    action_type,
                    configuration,
                    is_active,
                    created_by,
                    user_id
                )
                VALUES (
                    :name,
                    :description,
                    :trigger_type,
                    :action_type,
                    CAST(:configuration AS JSONB),
                    :is_active,
                    :created_by,
                    :user_id
                )
                RETURNING *
            """),
            data,
        )

        created = to_dict(
            result.mappings().one()
        )

        db.commit()
        return created

    except Exception:
        db.rollback()
        raise


# --------------------------------------------------
# GET WORKFLOW
# --------------------------------------------------

@router.get("/{workflow_id}")
def get_workflow(
    workflow_id: UUID,
    db: Session = Depends(get_db),
    user_id: UUID = Depends(get_user_id),
):
    return owned_workflow(
        db,
        workflow_id,
        user_id,
    )


# --------------------------------------------------
# UPDATE WORKFLOW
# --------------------------------------------------

@router.patch("/{workflow_id}")
def update_workflow(
    workflow_id: UUID,
    workflow: WorkflowUpdate,
    db: Session = Depends(get_db),
    user_id: UUID = Depends(get_user_id),
):
    changes = workflow.model_dump(
        exclude_unset=True
    )

    if not changes:
        raise HTTPException(
            status_code=400,
            detail="No changes provided",
        )

    required_fields = {
        "name",
        "trigger_type",
        "action_type",
        "configuration",
        "is_active",
    }

    for field in required_fields:
        if field in changes and changes[field] is None:
            raise HTTPException(
                status_code=422,
                detail=f"{field} cannot be null",
            )

    allowed_fields = {
        "name",
        "description",
        "trigger_type",
        "action_type",
        "configuration",
        "is_active",
    }

    if not set(changes).issubset(allowed_fields):
        raise HTTPException(
            status_code=422,
            detail="Invalid workflow fields",
        )

    try:
        existing = owned_workflow(
            db,
            workflow_id,
            user_id,
            lock=True,
        )

        # Validate the final action and configuration.
        final_action = changes.get(
            "action_type",
            existing["action_type"],
        )

        final_config = changes.get(
            "configuration",
            existing["configuration"],
        )

        try:
            validate_action(
                final_action,
                final_config,
            )
        except ValueError as exc:
            raise HTTPException(
                status_code=422,
                detail=str(exc),
            )

        if "configuration" in changes:
            changes["configuration"] = json.dumps(
                changes["configuration"]
            )

        assignments = []

        for field in changes:
            if field == "configuration":
                assignments.append(
                    "configuration = CAST(:configuration AS JSONB)"
                )
            else:
                assignments.append(
                    f"{field} = :{field}"
                )

        assignments.append(
            "updated_at = NOW()"
        )

        result = db.execute(
            text(f"""
                UPDATE public.workflows
                SET {", ".join(assignments)}
                WHERE id = :workflow_id
                  AND user_id = :user_id
                RETURNING *
            """),
            {
                **changes,
                "workflow_id": workflow_id,
                "user_id": user_id,
            },
        )

        updated = result.mappings().one_or_none()

        if updated is None:
            raise HTTPException(
                status_code=404,
                detail="Workflow not found",
            )

        db.commit()
        return to_dict(updated)

    except Exception:
        db.rollback()
        raise


# --------------------------------------------------
# DELETE WORKFLOW
# --------------------------------------------------

@router.delete(
    "/{workflow_id}",
    status_code=204,
)
def delete_workflow(
    workflow_id: UUID,
    db: Session = Depends(get_db),
    user_id: UUID = Depends(get_user_id),
):
    try:
        owned_workflow(
            db,
            workflow_id,
            user_id,
            lock=True,
        )

        run_count = db.execute(
            text("""
                SELECT COUNT(*)
                FROM public.workflow_runs
                WHERE workflow_id = :workflow_id
            """),
            {"workflow_id": workflow_id},
        ).scalar_one()

        if run_count > 0:
            raise HTTPException(
                status_code=409,
                detail=(
                    "Cannot delete a workflow "
                    "with execution history"
                ),
            )

        db.execute(
            text("""
                DELETE FROM public.workflows
                WHERE id = :workflow_id
                  AND user_id = :user_id
            """),
            {
                "workflow_id": workflow_id,
                "user_id": user_id,
            },
        )

        db.commit()
        return None

    except Exception:
        db.rollback()
        raise


# --------------------------------------------------
# WORKFLOW EXECUTION HISTORY
# --------------------------------------------------

@router.get("/{workflow_id}/runs")
def get_workflow_runs(
    workflow_id: UUID,
    db: Session = Depends(get_db),
    user_id: UUID = Depends(get_user_id),
):
    owned_workflow(
        db,
        workflow_id,
        user_id,
    )

    result = db.execute(
        text("""
            SELECT *
            FROM public.workflow_runs
            WHERE workflow_id = :workflow_id
            ORDER BY started_at DESC, id DESC
            LIMIT 100
        """),
        {"workflow_id": workflow_id},
    )

    return [
        to_dict(row)
        for row in result.mappings().all()
    ]


# --------------------------------------------------
# RECORD FAILED MANUAL RUN
# --------------------------------------------------

def record_failed_run(
    workflow_id: UUID,
    user_id: UUID,
    payload_json: str,
    error_message: str,
):
    try:
        with Session(engine) as db:
            owned = db.execute(
                text("""
                    SELECT 1
                    FROM public.workflows
                    WHERE id = :workflow_id
                      AND user_id = :user_id
                """),
                {
                    "workflow_id": workflow_id,
                    "user_id": user_id,
                },
            ).scalar_one_or_none()

            if owned is None:
                return

            db.execute(
                text("""
                    INSERT INTO public.workflow_runs (
                        workflow_id,
                        status,
                        trigger_payload,
                        error_message,
                        started_at,
                        completed_at
                    )
                    VALUES (
                        :workflow_id,
                        'Failed',
                        CAST(:payload AS JSONB),
                        :error_message,
                        NOW(),
                        NOW()
                    )
                """),
                {
                    "workflow_id": workflow_id,
                    "payload": payload_json,
                    "error_message": error_message[:2000],
                },
            )

            db.commit()

    except Exception:
        logger.exception(
            "Failed to record workflow execution failure"
        )


# --------------------------------------------------
# MANUALLY EXECUTE WORKFLOW
# --------------------------------------------------

@router.post("/{workflow_id}/run")
def run_workflow(
    workflow_id: UUID,
    request: WorkflowRunRequest,
    db: Session = Depends(get_db),
    user_id: UUID = Depends(get_user_id),
):
    if not request.confirm:
        raise HTTPException(
            status_code=400,
            detail="Execution requires confirm=true",
        )

    payload_json = json.dumps(
        request.payload,
        default=str,
    )

    try:
        workflow = owned_workflow(
            db,
            workflow_id,
            user_id,
            lock=True,
        )

        if not workflow["is_active"]:
            raise HTTPException(
                status_code=409,
                detail=(
                    "Workflow is inactive. "
                    "Activate it before running."
                ),
            )

        if workflow["trigger_type"] != "manual":
            raise HTTPException(
                status_code=409,
                detail=(
                    "Only manual workflows can be "
                    "executed through this endpoint."
                ),
            )

        action_type = workflow["action_type"]

        try:
            validated = validate_action(
                action_type,
                workflow["configuration"],
            )
        except ValueError as exc:
            raise HTTPException(
                status_code=422,
                detail=str(exc),
            )

        run_id = db.execute(
            text("""
                INSERT INTO public.workflow_runs (
                    workflow_id,
                    status,
                    trigger_payload,
                    started_at
                )
                VALUES (
                    :workflow_id,
                    'Running',
                    CAST(:payload AS JSONB),
                    NOW()
                )
                RETURNING id
            """),
            {
                "workflow_id": workflow_id,
                "payload": payload_json,
            },
        ).scalar_one()

        if action_type == "log_event":

            execution_result = {
                "action": "log_event",
                "message": validated["message"],
                "workflow_name": workflow["name"],
            }

        elif action_type == "create_task":

            created_task = db.execute(
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
                    **validated,
                    "user_id": user_id,
                },
            ).mappings().one()

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
                        'TASK_CREATED',
                        :description,
                        'Workflow Engine',
                        :user_id
                    )
                """),
                {
                    "task_id": created_task["id"],
                    "description": (
                        f'Task "{created_task["title"]}" '
                        f'was created by workflow '
                        f'"{workflow["name"]}".'
                    ),
                    "user_id": user_id,
                },
            )

            execution_result = {
                "action": "create_task",
                "message": "Task created successfully",
                "task_id": str(created_task["id"]),
                "task_title": created_task["title"],
            }

            # Prevent recursive automatic task triggers.

        else:
            raise HTTPException(
                status_code=422,
                detail="Unsupported workflow action",
            )

        completed_run = db.execute(
            text("""
                UPDATE public.workflow_runs
                SET
                    status = 'Completed',
                    result = CAST(:result AS JSONB),
                    completed_at = NOW()
                WHERE id = :run_id
                  AND workflow_id = :workflow_id
                RETURNING *
            """),
            {
                "run_id": run_id,
                "workflow_id": workflow_id,
                "result": json.dumps(execution_result),
            },
        ).mappings().one()

        db.commit()
        return to_dict(completed_run)

    except HTTPException:
        db.rollback()
        raise

    except Exception:
        db.rollback()

        logger.exception(
            "Manual workflow execution failed. Workflow=%s",
            workflow_id,
        )

        record_failed_run(
            workflow_id=workflow_id,
            user_id=user_id,
            payload_json=payload_json,
            error_message="Workflow execution failed",
        )

        raise HTTPException(
            status_code=500,
            detail="Workflow execution failed",
        )
