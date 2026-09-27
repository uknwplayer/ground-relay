use anchor_lang::prelude::Pubkey;
use ground_relay::{validate_cancel_at, validate_submit_at, TaskEscrow, TaskStatus};

const REWARD: u64 = 1_000_000;

fn key(byte: u8) -> Pubkey {
    Pubkey::new_from_array([byte; 32])
}

fn task(status: TaskStatus, expires_at: i64) -> TaskEscrow {
    TaskEscrow {
        task_id: [9; 32],
        poster: key(2),
        worker: key(1),
        mint: key(3),
        reward_amount: REWARD,
        expires_at,
        status,
        evidence_hash: [0; 32],
        bump: 255,
        vault_bump: 254,
    }
}

#[test]
fn evidence_must_arrive_before_task_deadline() {
    let claimed = task(TaskStatus::Claimed, 200);

    assert!(validate_submit_at(&claimed, key(1), [7; 32], 199).is_ok());
    assert!(validate_submit_at(&claimed, key(1), [7; 32], 200).is_err());
    assert!(validate_submit_at(&claimed, key(1), [7; 32], 201).is_err());
}

#[test]
fn claimed_task_refund_requires_expiry_and_never_overrides_delivery() {
    let claimed = task(TaskStatus::Claimed, 200);
    assert!(validate_cancel_at(&claimed, key(2), REWARD, 199).is_err());
    assert!(validate_cancel_at(&claimed, key(2), REWARD, 200).is_ok());
    assert!(validate_cancel_at(&claimed, key(2), REWARD, 201).is_ok());

    let delivered = task(TaskStatus::Delivered, 200);
    assert!(validate_cancel_at(&delivered, key(2), REWARD, 250).is_err());
}

#[test]
fn timeout_refund_still_requires_original_poster_and_funding() {
    let claimed = task(TaskStatus::Claimed, 200);

    assert!(validate_cancel_at(&claimed, key(4), REWARD, 200).is_err());
    assert!(validate_cancel_at(&claimed, key(2), REWARD - 1, 200).is_err());
}

#[test]
fn open_task_keeps_existing_cancellation_behavior() {
    let open = task(TaskStatus::Open, 200);
    assert!(validate_cancel_at(&open, key(2), REWARD, 150).is_ok());
}
