
import json
import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict
from sqlalchemy import text
from sqlalchemy.orm import Session

from auth import get_current_user
from database import engine
from ai_routes import TaskProposalParameters
from approvals_routes import add_approval_log, DEMO_ACTOR


router = APIRouter(
    prefix="/api/ai",
    tags=["AI Assistant"],
)

logger = logging.getLogger("opspilot.ai.submissions")


# --------------------------------------------------
# REQUEST MODELS
# --------------------------------------------------

class SubmitProposalRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    idempotency_key: UUID
    action_type: str
    parameters: TaskProposalParameters


# --------------------------------------------------
# DATABASE AND AUTHENTICATION
# --------------------------------------------------

def get_db():
    with Session(engine) as session:
        yield session


def get_user_id(
    current_user: dict = Depends(get_current_user),
) -> UUID:
    try:
        return UUID(current_user["sub"])

    except (KeyError, TypeError, ValueError):
        raise HTTPException(
            status_code=401,
            detail="Invalid authenticated user",
        )


def normalize_parameters(value):
    if isinstance(value, str):
        value = json.loads(value)

    return TaskProposalParameters.model_validate(
        value
    ).model_dump()


def load_existing_submission(
    db: Session,
    idempotency_key: UUID,
):
    """
    Load the key globally, including its parent owner.

    Do not return proposal details to the caller
    until ownership is checked.
    """

    return db.execute(
        text("""
            SELECT
                p.id AS proposal_id,
                p.approval_id,
                p.action_type,
                p.parameters,
                p.idempotency_key,
                a.status,
                a.user_id
            FROM public.ai_action_proposals AS p
            JOIN public.approvals AS a
              ON a.id = p.approval_id
            WHERE p.idempotency_key = :key
        """),
        {"key": idempotency_key},
    ).mappings().one_or_none()


# --------------------------------------------------
# SUBMIT AI PROPOSAL
# --------------------------------------------------

@router.post("/submit-proposal", status_code=201)
def submit_proposal(
    request: SubmitProposalRequest,
    db: Session = Depends(get_db),
    user_id: UUID = Depends(get_user_id),
):
    """
    Create an approval owned by the authenticated user.

    The proposal does not execute automatically.

    A globally unique idempotency key prevents
    duplicate submissions.
    """

    if request.action_type != "create_task":
        raise HTTPException(
            status_code=422,
            detail="Only create_task proposals are supported.",
        )

    parameters = request.parameters.model_dump()

    try:
        # Serialize concurrent submissions using the same key.
        db.execute(
            text("""
                SELECT pg_advisory_xact_lock(
                    hashtextextended(
                        CAST(:key AS TEXT),
                        0
                    )
                )
            """),
            {"key": str(request.idempotency_key)},
        )

        existing = load_existing_submission(
            db,
            request.idempotency_key,
        )

        if existing is not None:
            # Never expose another user's submission.
            if existing["user_id"] != user_id:
                raise HTTPException(
                    status_code=409,
                    detail="Idempotency key is unavailable.",
                )

            stored_parameters = normalize_parameters(
                existing["parameters"]
            )

            if (
                existing["action_type"] != request.action_type
                or stored_parameters != parameters
            ):
                raise HTTPException(
                    status_code=409,
                    detail=(
                        "This idempotency key was already used "
                        "for a different proposal."
                    ),
                )

            result = {
                "proposal_id": existing["proposal_id"],
                "approval_id": existing["approval_id"],
                "action_type": existing["action_type"],
                "parameters": stored_parameters,
                "approval_status": existing["status"],
                "duplicate": True,
                "message": (
                    "This proposal was already submitted. "
                    "No duplicate approval was created."
                ),
            }

            db.commit()
            return result

        approval_title = (
            f'AI Task Proposal: {parameters["title"]}'
        )[:200]

        approval_description = (
            "AI-assisted task creation request.\n\n"
            f'Task: {parameters["title"]}\n'
            f'Description: {parameters["description"]}\n'
            f'Owner: {parameters["owner"]}\n'
            f'Priority: {parameters["priority"]}\n\n'
            "Human review is required. "
            "Approval does not automatically create the task."
        )[:5000]

        approval = db.execute(
            text("""
                INSERT INTO public.approvals (
                    title,
                    description,
                    request_type,
                    requested_by,
                    user_id
                )
                VALUES (
                    :title,
                    :description,
                    'Operations',
                    :requested_by,
                    :user_id
                )
                RETURNING id, status
            """),
            {
                "title": approval_title,
                "description": approval_description,
                "requested_by": DEMO_ACTOR,
                "user_id": user_id,
            },
        ).mappings().one()

        proposal = db.execute(
            text("""
                INSERT INTO public.ai_action_proposals (
                    approval_id,
                    action_type,
                    parameters,
                    idempotency_key
                )
                VALUES (
                    :approval_id,
                    :action_type,
                    CAST(:parameters AS JSONB),
                    :idempotency_key
                )
                RETURNING id
            """),
            {
                "approval_id": approval["id"],
                "action_type": "create_task",
                "parameters": json.dumps(parameters),
                "idempotency_key": request.idempotency_key,
            },
        ).mappings().one()

        add_approval_log(
            db=db,
            approval_id=approval["id"],
            action="APPROVAL_REQUESTED",
            description=(
                "AI-assisted task proposal submitted "
                "for human approval."
            ),
            actor=DEMO_ACTOR,
        )

        db.commit()

        logger.info(
            "AI proposal submitted. "
            "Proposal=%s Approval=%s User=%s",
            proposal["id"],
            approval["id"],
            user_id,
        )

        return {
            "proposal_id": proposal["id"],
            "approval_id": approval["id"],
            "action_type": "create_task",
            "parameters": parameters,
            "approval_status": approval["status"],
            "duplicate": False,
            "message": (
                "AI task proposal submitted for human review. "
                "No task has been created."
            ),
        }

    except HTTPException:
        db.rollback()
        raise

    except Exception:
        db.rollback()
        logger.exception(
            "Failed to submit AI action proposal."
        )
        raise


# --------------------------------------------------
# EXECUTE APPROVED AI PROPOSAL
# --------------------------------------------------

@router.post("/proposals/{proposal_id}/execute")
def execute_approved_proposal(
    proposal_id: UUID,
    db: Session = Depends(get_db),
    user_id: UUID = Depends(get_user_id),
):
    """
    Execute only the authenticated user's approved
    create_task proposal.

    The approval row is locked until transaction end.

    Duplicate execution is prevented by the
    database UNIQUE(proposal_id) constraint.
    """

    try:
        proposal = db.execute(
            text("""
                SELECT
                    p.id AS proposal_id,
                    p.approval_id,
                    p.action_type,
                    p.parameters,
                    a.status AS approval_status
                FROM public.ai_action_proposals AS p
                JOIN public.approvals AS a
                  ON a.id = p.approval_id
                WHERE p.id = :proposal_id
                  AND a.user_id = :user_id
                FOR UPDATE OF a
            """),
            {
                "proposal_id": proposal_id,
                "user_id": user_id,
            },
        ).mappings().one_or_none()

        if proposal is None:
            raise HTTPException(
                status_code=404,
                detail="AI action proposal not found.",
            )

        existing_execution = db.execute(
            text("""
                SELECT
                    e.id AS execution_id,
                    e.task_id,
                    e.executed_by,
                    e.executed_at
                FROM public.ai_action_executions AS e
                JOIN public.ai_action_proposals AS p
                  ON p.id = e.proposal_id
                JOIN public.approvals AS a
                  ON a.id = p.approval_id
                WHERE e.proposal_id = :proposal_id
                  AND a.user_id = :user_id
            """),
            {
                "proposal_id": proposal_id,
                "user_id": user_id,
            },
        ).mappings().one_or_none()

        if existing_execution is not None:
            result = {
                "proposal_id": proposal_id,
                "approval_id": proposal["approval_id"],
                "approval_status": proposal["approval_status"],
                "execution_id": existing_execution["execution_id"],
                "task_id": existing_execution["task_id"],
                "executed_by": existing_execution["executed_by"],
                "executed_at": existing_execution["executed_at"],
                "already_executed": True,
                "message": (
                    "This proposal was already executed. "
                    "No duplicate task was created."
                ),
            }

            db.commit()
            return result

        if proposal["approval_status"] != "Approved":
            raise HTTPException(
                status_code=409,
                detail=(
                    "Only approved AI proposals can execute. "
                    f'Current status: {proposal["approval_status"]}.'
                ),
            )

        if proposal["action_type"] != "create_task":
            raise HTTPException(
                status_code=422,
                detail="Unsupported AI action type.",
            )

        try:
            parameters = normalize_parameters(
                proposal["parameters"]
            )

        except (ValueError, TypeError, json.JSONDecodeError):
            raise HTTPException(
                status_code=422,
                detail="Stored AI proposal parameters are invalid.",
            )

        # Create a task owned by the authenticated user.
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
                RETURNING id, title, status
            """),
            {
                **parameters,
                "user_id": user_id,
            },
        ).mappings().one()

        execution = db.execute(
            text("""
                INSERT INTO public.ai_action_executions (
                    proposal_id,
                    task_id,
                    executed_by
                )
                VALUES (
                    :proposal_id,
                    :task_id,
                    :executed_by
                )
                RETURNING id, executed_at
            """),
            {
                "proposal_id": proposal_id,
                "task_id": task["id"],
                "executed_by": DEMO_ACTOR,
            },
        ).mappings().one()

        add_approval_log(
            db=db,
            approval_id=proposal["approval_id"],
            action="AI_ACTION_EXECUTED",
            description=(
                "Approved AI create_task proposal executed. "
                f'Task ID: {task["id"]}.'
            ),
            actor=DEMO_ACTOR,
        )

        db.commit()

        logger.info(
            "Approved AI proposal executed. "
            "Proposal=%s Task=%s User=%s",
            proposal_id,
            task["id"],
            user_id,
        )

        return {
            "proposal_id": proposal_id,
            "approval_id": proposal["approval_id"],
            "approval_status": proposal["approval_status"],
            "execution_id": execution["id"],
            "task_id": task["id"],
            "task_title": task["title"],
            "task_status": task["status"],
            "executed_by": DEMO_ACTOR,
            "executed_at": execution["executed_at"],
            "already_executed": False,
            "message": (
                "Approved AI proposal executed successfully. "
                "The task was created exactly once."
            ),
        }

    except HTTPException:
        db.rollback()
        raise

    except Exception:
        db.rollback()
        logger.exception(
            "Failed to execute approved AI proposal. "
            "Proposal=%s",
            proposal_id,
        )
        raise


# --------------------------------------------------
# AI APPROVAL EXECUTION STATUS
# --------------------------------------------------

@router.get("/approvals/{approval_id}/execution-status")
def get_ai_approval_execution_status(
    approval_id: UUID,
    db: Session = Depends(get_db),
    user_id: UUID = Depends(get_user_id),
):
    """
    Read-only execution status lookup.

    Only returns proposals linked to approvals
    owned by the authenticated user.
    """

    result = db.execute(
        text("""
            SELECT
                p.id AS proposal_id,
                p.approval_id,
                p.action_type,
                a.status AS approval_status,
                e.id AS execution_id,
                e.task_id,
                e.executed_at
            FROM public.ai_action_proposals AS p
            JOIN public.approvals AS a
              ON a.id = p.approval_id
            LEFT JOIN public.ai_action_executions AS e
              ON e.proposal_id = p.id
            WHERE p.approval_id = :approval_id
              AND a.user_id = :user_id
        """),
        {
            "approval_id": approval_id,
            "user_id": user_id,
        },
    ).mappings().one_or_none()

    if result is None:
        raise HTTPException(
            status_code=404,
            detail="No AI proposal is linked to this approval.",
        )

    return {
        "proposal_id": result["proposal_id"],
        "approval_id": result["approval_id"],
        "action_type": result["action_type"],
        "approval_status": result["approval_status"],
        "already_executed": result["execution_id"] is not None,
        "execution_id": result["execution_id"],
        "task_id": result["task_id"],
        "executed_at": result["executed_at"],
    }
