
import json
import logging
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, Field, ValidationError, field_validator
from sqlalchemy import text
from sqlalchemy.orm import Session

from database import engine


logger = logging.getLogger("opspilot.workflow_engine")

EventType = Literal[
    "task_created",
    "approval_approved",
    "approval_rejected",
]

Priority = Literal["Low", "Medium", "High"]


class TaskActionConfig(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: str | None = None
    owner: str = Field(
        default="Operations",
        min_length=1,
        max_length=150,
    )
    priority: Priority = "Medium"

    @field_validator("title", "owner")
    @classmethod
    def strip_required(cls, value: str) -> str:
        value = value.strip()

        if not value:
            raise ValueError("Value cannot be blank")

        return value


def validate_action(
    action_type: str,
    configuration: Any,
) -> dict[str, Any]:

    if not isinstance(configuration, dict):
        raise ValueError(
            "Workflow configuration must be a JSON object"
        )

    if action_type == "log_event":
        message = configuration.get(
            "message",
            "Workflow executed successfully.",
        )

        if (
            not isinstance(message, str)
            or not message.strip()
            or len(message) > 2000
        ):
            raise ValueError(
                "log_event message must be 1-2000 characters"
            )

        return {"message": message.strip()}

    if action_type == "create_task":
        try:
            return TaskActionConfig.model_validate(
                configuration
            ).model_dump()

        except ValidationError as exc:
            raise ValueError(
                "Invalid create_task configuration"
            ) from exc

    raise ValueError(
        f"Unsupported workflow action: {action_type}"
    )


def _json(value: Any) -> str:
    return json.dumps(value, default=str)


def _validate_user_id(user_id: UUID | str) -> UUID:
    try:
        return UUID(str(user_id))
    except (TypeError, ValueError, AttributeError) as exc:
        raise ValueError(
            "A valid authenticated user_id is required"
        ) from exc


def _record_failed_run(
    workflow_id: UUID,
    user_id: UUID,
    payload_json: str,
    reason: str,
) -> None:

    try:
        with Session(engine) as db:
            # Never record a run against another user's workflow.
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
                        :reason,
                        NOW(),
                        NOW()
                    )
                """),
                {
                    "workflow_id": workflow_id,
                    "payload": payload_json,
                    "reason": reason[:2000],
                },
            )

            db.commit()

    except Exception:
        logger.exception(
            "Could not record failed run for workflow %s",
            workflow_id,
        )


def _run_one(
    workflow_id: UUID,
    user_id: UUID,
    trigger: EventType,
    payload: dict[str, Any],
    event_id: str,
) -> str:

    run_payload = {
        **payload,
        "_opspilot_event": {
            "id": event_id,
            "type": trigger,
        },
    }

    payload_json = _json(run_payload)

    try:
        with Session(engine) as db:

            # Serialize executions for the same workflow/event.
            db.execute(
                text("""
                    SELECT pg_advisory_xact_lock(
                        hashtext(CAST(:workflow_id AS TEXT)),
                        hashtext(:event_key)
                    )
                """),
                {
                    "workflow_id": str(workflow_id),
                    "event_key": f"{trigger}:{event_id}",
                },
            )

            # Verify ownership again inside the transaction.
            workflow = db.execute(
                text("""
                    SELECT *
                    FROM public.workflows
                    WHERE id = :workflow_id
                      AND user_id = :user_id
                    FOR UPDATE
                """),
                {
                    "workflow_id": workflow_id,
                    "user_id": user_id,
                },
            ).mappings().one_or_none()

            if (
                workflow is None
                or not workflow["is_active"]
                or workflow["trigger_type"] != trigger
            ):
                db.rollback()
                return "skipped"

            # Preserve duplicate prevention.
            previous = db.execute(
                text("""
                    SELECT id
                    FROM public.workflow_runs
                    WHERE workflow_id = :workflow_id
                      AND status = 'Completed'
                      AND trigger_payload @>
                          CAST(:event_marker AS JSONB)
                    LIMIT 1
                """),
                {
                    "workflow_id": workflow_id,
                    "event_marker": _json({
                        "_opspilot_event":
                            run_payload["_opspilot_event"]
                    }),
                },
            ).scalar_one_or_none()

            if previous is not None:
                db.rollback()
                return "duplicate"

            validated = validate_action(
                workflow["action_type"],
                workflow["configuration"],
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

            if workflow["action_type"] == "log_event":

                result = {
                    "action": "log_event",
                    "message": validated["message"],
                    "workflow_name": workflow["name"],
                }

            elif workflow["action_type"] == "create_task":

                task = db.execute(
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
                        RETURNING id, title
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
                        "task_id": task["id"],
                        "description": (
                            f'Task "{task["title"]}" '
                            f'was created by workflow '
                            f'"{workflow["name"]}".'
                        ),
                        "user_id": user_id,
                    },
                )

                result = {
                    "action": "create_task",
                    "message": "Task created successfully",
                    "task_id": str(task["id"]),
                    "task_title": task["title"],
                }

                # Workflow-created tasks are intentionally
                # not dispatched again automatically.

            else:
                raise ValueError(
                    "Unsupported workflow action"
                )

            db.execute(
                text("""
                    UPDATE public.workflow_runs
                    SET
                        status = 'Completed',
                        result = CAST(:result AS JSONB),
                        completed_at = NOW()
                    WHERE id = :run_id
                """),
                {
                    "run_id": run_id,
                    "result": _json(result),
                },
            )

            db.commit()

            return "completed"

    except Exception as exc:
        logger.exception(
            "Workflow %s failed for event %s",
            workflow_id,
            event_id,
        )

        _record_failed_run(
            workflow_id=workflow_id,
            user_id=user_id,
            payload_json=payload_json,
            reason=str(exc),
        )

        return "failed"


def dispatch_workflow_event(
    trigger: EventType,
    event_id: str | UUID,
    payload: dict[str, Any],
    *,
    user_id: UUID | str,
) -> dict[str, int]:

    if trigger not in (
        "task_created",
        "approval_approved",
        "approval_rejected",
    ):
        raise ValueError(
            "Unsupported automatic trigger"
        )

    if not str(event_id).strip():
        raise ValueError("event_id is required")

    if not isinstance(payload, dict):
        raise ValueError(
            "payload must be a dictionary"
        )

    if "_opspilot_event" in payload:
        raise ValueError(
            "Reserved payload key: _opspilot_event"
        )

    owner_id = _validate_user_id(user_id)

    # Check that the originating event belongs to
    # the same user before dispatching workflows.
    source_table = (
        "tasks"
        if trigger == "task_created"
        else "approvals"
    )

    try:
        source_id = UUID(str(event_id))
    except (TypeError, ValueError, AttributeError) as exc:
        raise ValueError(
            "A valid source event UUID is required"
        ) from exc

    with Session(engine) as db:
        source_exists = db.execute(
            text(f"""
                SELECT 1
                FROM public.{source_table}
                WHERE id = :event_id
                  AND user_id = :user_id
            """),
            {
                "event_id": source_id,
                "user_id": owner_id,
            },
        ).scalar_one_or_none()

        if source_exists is None:
            raise ValueError(
                "Source event not found for authenticated user"
            )

        workflows = db.execute(
            text("""
                SELECT id
                FROM public.workflows
                WHERE is_active = TRUE
                  AND trigger_type = :trigger
                  AND user_id = :user_id
                ORDER BY created_at, id
            """),
            {
                "trigger": trigger,
                "user_id": owner_id,
            },
        ).scalars().all()

    summary = {
        "completed": 0,
        "failed": 0,
        "duplicate": 0,
        "skipped": 0,
    }

    for workflow_id in workflows:
        outcome = _run_one(
            workflow_id=workflow_id,
            user_id=owner_id,
            trigger=trigger,
            payload=payload,
            event_id=str(source_id),
        )

        summary[outcome] += 1

    return summary
