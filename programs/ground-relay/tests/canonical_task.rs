use anchor_lang::prelude::Pubkey;
use ground_relay::{is_canonical_task, TaskEscrow, TaskStatus, ID};

fn task_with(poster: Pubkey, task_id: [u8; 32], bump: u8) -> TaskEscrow {
    TaskEscrow {
        task_id,
        poster,
        worker: Pubkey::default(),
        mint: Pubkey::new_unique(),
        reward_amount: 1_000_000,
        expires_at: 2_000_000_000,
        status: TaskStatus::Open,
        evidence_hash: [0; 32],
        bump,
        vault_bump: 1,
    }
}

#[test]
fn canonical_task_constraint_rejects_noncanonical_address() {
    let poster = Pubkey::new_unique();
    let task_id = [9; 32];
    let (canonical, bump) = Pubkey::find_program_address(
        &[b"task", poster.as_ref(), task_id.as_ref()],
        &ID,
    );
    let task = task_with(poster, task_id, bump);

    assert!(is_canonical_task(canonical, &task));
    assert!(!is_canonical_task(Pubkey::new_unique(), &task));
}
