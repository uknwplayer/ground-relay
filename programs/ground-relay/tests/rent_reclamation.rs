use anchor_lang::prelude::Pubkey;
use ground_relay::{validate_terminal_vault_close, TaskEscrow, TaskStatus};

const REWARD: u64 = 1_000_000;

fn key(byte: u8) -> Pubkey {
    Pubkey::new_from_array([byte; 32])
}

fn sample_task(status: TaskStatus) -> TaskEscrow {
    TaskEscrow {
        task_id: [9; 32],
        poster: key(2),
        worker: key(1),
        mint: key(3),
        reward_amount: REWARD,
        expires_at: 200,
        status,
        evidence_hash: [7; 32],
        bump: 255,
        vault_bump: 254,
    }
}

#[test]
fn terminal_empty_vault_can_close_only_to_original_poster() {
    for status in [TaskStatus::Paid, TaskStatus::Cancelled] {
        let task = sample_task(status);
        assert!(validate_terminal_vault_close(&task, key(2), 0).is_ok());
        assert!(validate_terminal_vault_close(&task, key(4), 0).is_err());
        assert!(validate_terminal_vault_close(&task, key(2), 1).is_err());
    }
}

#[test]
fn non_terminal_vault_cannot_close() {
    for status in [
        TaskStatus::Open,
        TaskStatus::Claimed,
        TaskStatus::Delivered,
        TaskStatus::Accepted,
    ] {
        let task = sample_task(status);
        assert!(validate_terminal_vault_close(&task, key(2), 0).is_err());
    }
}
