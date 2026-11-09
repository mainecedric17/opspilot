
import logging
from typing import Literal
from uuid import UUID

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    HTTPException,
    Query,
)
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import text
from sqlalchemy.orm import Session

from auth import get_current_user
from database import engine
from workflow_engine import dispatch_workflow_event


router = APIRouter(
    prefix="/api/approvals",
    tags=["Approvals"],
)

logger = logging.getLogger("opspilot.approvals")

ApprovalStatus = Literal[
    "Pending",
    "Approved",
    "Rejected",
]

RequestType = Literal[
    "General",
    "Purchase",
    "Access",
    "Operations",
    "Other",
]

DEMO_ACTOR = "Workspace Admin"


# --------------------------------------------------
# REQUEST MODELS
# --------------------------------------------------

class ApprovalCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: str = Field(min_length=1, max_length=5000)
    request_type: RequestType = "General"
    requested_by: str = Field(min_length=1, max_length=100)

    @field_validator(
        "title",
        "description",
        "requested_by",
    )
    @classmethod
    def validate_text(cls, value: str) -> str:
        value = value.strip()

        if not value:
            raise ValueError("Value cannot be blank.")

        return value


class ApprovalDecision(BaseModel):
    note: str | None = Field(
        default=None,
        max_length=2000,
    )

    @field_validator("note")
    @classmethod
    def clean_note(cls, value: str | None):
        if value is None:
            return None

        return value.strip() or None


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


def get_owned_approval(
    db: Session,
    approval_id: UUID,
    user_id: UUID,
    lock: bool = False,
) -> dict:
    query = """
        SELECT *
        FROM public.approvals
        WHERE id = :approval_id
          AND user_id = :user_id
    """

    if lock:
        query += " FOR UPDATE"

    result = db.execute(
        text(query),
        {
            "approval_id": approval_id,
            "user_id": user_id,
        },
    ).mappings().one_or_none()

    if result is None:
        raise HTTPException(
            status_code=404,
            detail="Approval request not found.",
        )

    return dict(result)


# --------------------------------------------------
# APPROVAL ACTIVITY LOGGING
# --------------------------------------------------

def add_approval_log(
    db: Session,
    approval_id: UUID,
    action: str,
    description: str,
    actor: str = DEMO_ACTOR,
):
    """
    Approval history inherits ownership through
    the parent approvals record.

    The caller handles the transaction commit.
    """

    db.execute(
        text("""
            INSERT INTO public.approval_activity_logs (
                approval_id,
                action,
                description,
                actor
            )
            VALUES (
                :approval_id,
                :action,
                :description,
                :actor
            )
        """),
        {
            "approval_id": approval_id,
            "action": action,
            "description": description,
            "actor": actor,
        },
    )


# --------------------------------------------------
# AI APPROVAL ISOLATION
# --------------------------------------------------

def is_ai_action_approval(
    db: Session,
    approval_id: UUID,
) -> bool:
    """
    Identify AI-linked approvals.

    Call only after the parent approval's
    ownership has been verified.
    """

    result = db.execute(
        text("""
            SELECT public.is_ai_action_approval(
                :approval_id
            )
        """),
        {"approval_id": approval_id},
    )

    return bool(result.scalar_one())


# --------------------------------------------------
# AUTOMATIC APPROVAL WORKFLOW DISPATCH
# --------------------------------------------------

def dispatch_approval_decision_event(
    approval_id: UUID,
    decision: str,
    approval_data: dict,
    user_id: UUID,
):
    """
    Run only the authenticated owner's workflows.

    The approval transaction has already committed.
    """

    try:
        with Session(engine) as db:
            existing = db.execute(
                text("""
                    SELECT id, status
                    FROM public.approvals
                    WHERE id = :approval_id
                      AND user_id = :user_id
                """),
                {
                    "approval_id": approval_id,
                    "user_id": user_id,
                },
            ).mappings().one_or_none()

            if existing is None:
                logger.warning(
                    "Approval dispatch skipped: owner mismatch. "
                    "Approval=%s",
                    approval_id,
                )
                return

            if existing["status"] != decision:
                logger.warning(
                    "Approval dispatch skipped: status mismatch. "
                    "Approval=%s",
                    approval_id,
                )
                return

            if is_ai_action_approval(db, approval_id):
                logger.info(
                    "Generic workflow skipped for AI approval. "
                    "Approval=%s",
                    approval_id,
                )
                return

        if decision == "Approved":
            trigger = "approval_approved"

        elif decision == "Rejected":
            trigger = "approval_rejected"

        else:
            logger.warning(
                "Unsupported approval decision: %s",
                decision,
            )
            return

        payload = {
            "approval_id": str(approval_id),
            "approval": approval_data,
            "decision": decision,
            "actor": DEMO_ACTOR,
            "source": "opspilot_api",
        }

        summary = dispatch_workflow_event(
            trigger=trigger,
            event_id=approval_id,
            payload=payload,
            user_id=user_id,
        )

        logger.info(
            "Approval workflows dispatched. "
            "Approval=%s User=%s Trigger=%s Summary=%s",
            approval_id,
            user_id,
            trigger,
            summary,
        )

    except Exception:
        logger.exception(
            "Approval workflow dispatch failed. "
            "Approval=%s",
            approval_id,
        )


# --------------------------------------------------
# LIST APPROVALS
# --------------------------------------------------

@router.get("")
def list_approvals(
    status: ApprovalStatus | None = None,
    limit: int = Query(default=50, ge=1, le=100),
    db: Session = Depends(get_db),
    user_id: UUID = Depends(get_user_id),
):
    result = db.execute(
        text("""
            SELECT *
            FROM public.approvals
            WHERE user_id = :user_id
              AND (
                  CAST(:status AS TEXT) IS NULL
                  OR status = :status
              )
            ORDER BY created_at DESC, id DESC
            LIMIT :limit
        """),
        {
            "user_id": user_id,
            "status": status,
            "limit": limit,
        },
    )

    return [
        dict(row)
        for row in result.mappings().all()
    ]


# --------------------------------------------------
# CREATE REGULAR APPROVAL
# --------------------------------------------------

@router.post("", status_code=201)
def create_approval(
    request: ApprovalCreate,
    db: Session = Depends(get_db),
    user_id: UUID = Depends(get_user_id),
):
    try:
        result = db.execute(
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
                    :request_type,
                    :requested_by,
                    :user_id
                )
                RETURNING *
            """),
            {
                **request.model_dump(),
                "user_id": user_id,
            },
        )

        approval = dict(result.mappings().one())

        add_approval_log(
            db=db,
            approval_id=approval["id"],
            action="APPROVAL_REQUESTED",
            description=(
                f'Approval request "{approval["title"]}" '
                "was submitted."
            ),
            actor=approval["requested_by"],
        )

        db.commit()

        logger.info(
            "Approval created. ID=%s User=%s",
            approval["id"],
            user_id,
        )

        return approval

    except Exception:
        db.rollback()
        logger.exception(
            "Failed to create approval."
        )
        raise


# --------------------------------------------------
# GET APPROVAL
# --------------------------------------------------

@router.get("/{approval_id}")
def get_approval(
    approval_id: UUID,
    db: Session = Depends(get_db),
    user_id: UUID = Depends(get_user_id),
):
    return get_owned_approval(
        db=db,
        approval_id=approval_id,
        user_id=user_id,
    )


# --------------------------------------------------
# APPROVAL DECISION
# --------------------------------------------------

def decide_approval(
    approval_id: UUID,
    decision: ApprovalStatus,
    note: str | None,
    db: Session,
    user_id: UUID,
):
    if decision not in ("Approved", "Rejected"):
        raise HTTPException(
            status_code=422,
            detail="Invalid approval decision.",
        )

    if decision == "Rejected" and not note:
        raise HTTPException(
            status_code=422,
            detail="A rejection reason is required.",
        )

    try:
        existing = get_owned_approval(
            db=db,
            approval_id=approval_id,
            user_id=user_id,
            lock=True,
        )

        if existing["status"] != "Pending":
            raise HTTPException(
                status_code=409,
                detail=(
                    "This request has already been reviewed. "
                    "Only pending requests can be decided."
                ),
            )

        ai_linked = is_ai_action_approval(
            db,
            approval_id,
        )

        result = db.execute(
            text("""
                UPDATE public.approvals
                SET
                    status = :status,
                    reviewed_by = :reviewed_by,
                    decision_note = :decision_note,
                    reviewed_at = NOW(),
                    updated_at = NOW()
                WHERE id = :approval_id
                  AND user_id = :user_id
                RETURNING *
            """),
            {
                "approval_id": approval_id,
                "user_id": user_id,
                "status": decision,
                "reviewed_by": DEMO_ACTOR,
                "decision_note": note,
            },
        )

        updated_row = result.mappings().one_or_none()

        if updated_row is None:
            raise HTTPException(
                status_code=404,
                detail="Approval request not found.",
            )

        updated = dict(updated_row)

        action = (
            "APPROVAL_APPROVED"
            if decision == "Approved"
            else "APPROVAL_REJECTED"
        )

        add_approval_log(
            db=db,
            approval_id=approval_id,
            action=action,
            description=(
                f'Approval request "{updated["title"]}" '
                f'was {decision.lower()}.'
            ),
            actor=DEMO_ACTOR,
        )

        db.commit()

        # Internal metadata only, not a database column.
        updated["_is_ai_action_approval"] = ai_linked

        logger.info(
            "Approval decision recorded. "
            "ID=%s User=%s Status=%s AI=%s",
            approval_id,
            user_id,
            decision,
            ai_linked,
        )

        return updated

    except HTTPException:
        db.rollback()
        raise

    except Exception:
        db.rollback()
        logger.exception(
            "Failed to record approval decision."
        )
        raise


# --------------------------------------------------
# SCHEDULE AUTOMATIC WORKFLOWS
# --------------------------------------------------

def schedule_approval_automation(
    background_tasks: BackgroundTasks,
    approval: dict,
    user_id: UUID,
):
    if approval.get("_is_ai_action_approval"):
        logger.info(
            "AI approval generic automation suppressed. "
            "Approval=%s",
            approval["id"],
        )
        return

    approval_id = approval["id"]
    decision = approval["status"]

    approval_data = {
        "id": str(approval["id"]),
        "title": approval["title"],
        "description": approval["description"],
        "request_type": approval["request_type"],
        "requested_by": approval["requested_by"],
        "status": approval["status"],
        "reviewed_by": approval["reviewed_by"],
        "decision_note": approval["decision_note"],
        "reviewed_at": (
            str(approval["reviewed_at"])
            if approval["reviewed_at"] is not None
            else None
        ),
    }

    background_tasks.add_task(
        dispatch_approval_decision_event,
        approval_id,
        decision,
        approval_data,
        user_id,
    )


# --------------------------------------------------
# APPROVE
# --------------------------------------------------

@router.post("/{approval_id}/approve")
def approve_request(
    approval_id: UUID,
    request: ApprovalDecision,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    user_id: UUID = Depends(get_user_id),
):
    updated = decide_approval(
        approval_id=approval_id,
        decision="Approved",
        note=request.note,
        db=db,
        user_id=user_id,
    )

    schedule_approval_automation(
        background_tasks,
        updated,
        user_id,
    )

    return {
        key: value
        for key, value in updated.items()
        if not key.startswith("_")
    }


# --------------------------------------------------
# REJECT
# --------------------------------------------------

@router.post("/{approval_id}/reject")
def reject_request(
    approval_id: UUID,
    request: ApprovalDecision,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    user_id: UUID = Depends(get_user_id),
):
    updated = decide_approval(
        approval_id=approval_id,
        decision="Rejected",
        note=request.note,
        db=db,
        user_id=user_id,
    )

    schedule_approval_automation(
        background_tasks,
        updated,
        user_id,
    )

    return {
        key: value
        for key, value in updated.items()
        if not key.startswith("_")
    }


# --------------------------------------------------
# APPROVAL HISTORY
# --------------------------------------------------

@router.get("/{approval_id}/history")
def get_approval_history(
    approval_id: UUID,
    db: Session = Depends(get_db),
    user_id: UUID = Depends(get_user_id),
):
    # Verify parent ownership before reading history.
    get_owned_approval(
        db=db,
        approval_id=approval_id,
        user_id=user_id,
    )

    result = db.execute(
        text("""
            SELECT
                h.id,
                h.approval_id,
                h.action,
                h.description,
                h.actor,
                h.created_at
            FROM public.approval_activity_logs AS h
            JOIN public.approvals AS a
              ON a.id = h.approval_id
            WHERE h.approval_id = :approval_id
              AND a.user_id = :user_id
            ORDER BY h.created_at DESC, h.id DESC
        """),
        {
            "approval_id": approval_id,
            "user_id": user_id,
        },
    )

    return [
        dict(row)
        for row in result.mappings().all()
    ]
