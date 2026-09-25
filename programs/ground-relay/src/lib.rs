use anchor_lang::prelude::*;
use anchor_spl::token_interface::{
    self, Mint, TokenAccount, TokenInterface, TransferChecked,
};

declare_id!("6CtPVpGHjborfUxFukC8sa97SgNo3XuvAAw8FMxmeVAM");

#[program]
pub mod ground_relay {
    use super::*;

    pub fn post_task(
        ctx: Context<PostTask>,
        task_id: [u8; 32],
        reward_amount: u64,
        expires_at: i64,
    ) -> Result<()> {
        require!(reward_amount > 0, RelayError::ZeroReward);
        require!(
            expires_at > Clock::get()?.unix_timestamp,
            RelayError::InvalidExpiry
        );

        let task = &mut ctx.accounts.task;
        task.task_id = task_id;
        task.poster = ctx.accounts.poster.key();
        task.worker = Pubkey::default();
        task.mint = ctx.accounts.mint.key();
        task.reward_amount = reward_amount;
        task.expires_at = expires_at;
        task.status = TaskStatus::Open;
        task.evidence_hash = [0; 32];
        task.bump = ctx.bumps.task;
        task.vault_bump = ctx.bumps.vault;

        let decimals = ctx.accounts.mint.decimals;
        let cpi_accounts = TransferChecked {
            mint: ctx.accounts.mint.to_account_info(),
            from: ctx.accounts.poster_token.to_account_info(),
            to: ctx.accounts.vault.to_account_info(),
            authority: ctx.accounts.poster.to_account_info(),
        };
        token_interface::transfer_checked(
            CpiContext::new(ctx.accounts.token_program.key(), cpi_accounts),
            reward_amount,
            decimals,
        )?;

        emit!(TaskPosted {
            task: task.key(),
            poster: task.poster,
            mint: task.mint,
            reward_amount,
            expires_at,
        });

        Ok(())
    }

    pub fn claim_task(ctx: Context<ClaimTask>) -> Result<()> {
        let task = &mut ctx.accounts.task;
        validate_claim(task, Clock::get()?.unix_timestamp)?;

        task.worker = ctx.accounts.worker.key();
        task.status = TaskStatus::Claimed;

        emit!(TaskClaimed {
            task: task.key(),
            worker: task.worker,
        });

        Ok(())
    }

    pub fn submit_evidence(
        ctx: Context<SubmitEvidence>,
        evidence_hash: [u8; 32],
    ) -> Result<()> {
        let task = &mut ctx.accounts.task;
        validate_submit(task, ctx.accounts.worker.key(), evidence_hash)?;

        task.evidence_hash = evidence_hash;
        task.status = TaskStatus::Delivered;

        emit!(EvidenceSubmitted {
            task: task.key(),
            worker: task.worker,
            evidence_hash,
        });

        Ok(())
    }

    pub fn accept_task(ctx: Context<AcceptTask>) -> Result<()> {
        let task = &mut ctx.accounts.task;
        validate_accept(task, ctx.accounts.poster.key())?;

        task.status = TaskStatus::Accepted;

        emit!(TaskAccepted {
            task: task.key(),
            evidence_hash: task.evidence_hash,
        });

        Ok(())
    }

    pub fn release_payment(ctx: Context<ReleasePayment>) -> Result<()> {
        let task = &mut ctx.accounts.task;
        validate_release(
            task,
            ctx.accounts.worker.key(),
            ctx.accounts.mint.key(),
            ctx.accounts.vault.amount,
        )?;

        let poster_key = task.poster;
        let task_id = task.task_id;
        let bump = [task.bump];
        let signer_seeds: &[&[u8]] = &[
            b"task",
            poster_key.as_ref(),
            task_id.as_ref(),
            &bump,
        ];
        let signer = &[signer_seeds];

        let cpi_accounts = TransferChecked {
            mint: ctx.accounts.mint.to_account_info(),
            from: ctx.accounts.vault.to_account_info(),
            to: ctx.accounts.worker_token.to_account_info(),
            authority: task.to_account_info(),
        };
        token_interface::transfer_checked(
            CpiContext::new(ctx.accounts.token_program.key(), cpi_accounts)
                .with_signer(signer),
            task.reward_amount,
            ctx.accounts.mint.decimals,
        )?;

        task.status = TaskStatus::Paid;

        emit!(TaskPaid {
            task: task.key(),
            worker: task.worker,
            amount: task.reward_amount,
            mint: task.mint,
        });

        Ok(())
    }

    pub fn cancel_open_task(ctx: Context<CancelOpenTask>) -> Result<()> {
        let task = &mut ctx.accounts.task;
        validate_cancel(
            task,
            ctx.accounts.poster.key(),
            ctx.accounts.vault.amount,
        )?;

        let poster_key = task.poster;
        let task_id = task.task_id;
        let bump = [task.bump];
        let signer_seeds: &[&[u8]] = &[
            b"task",
            poster_key.as_ref(),
            task_id.as_ref(),
            &bump,
        ];
        let signer = &[signer_seeds];

        let cpi_accounts = TransferChecked {
            mint: ctx.accounts.mint.to_account_info(),
            from: ctx.accounts.vault.to_account_info(),
            to: ctx.accounts.poster_token.to_account_info(),
            authority: task.to_account_info(),
        };
        token_interface::transfer_checked(
            CpiContext::new(ctx.accounts.token_program.key(), cpi_accounts)
                .with_signer(signer),
            task.reward_amount,
            ctx.accounts.mint.decimals,
        )?;

        task.status = TaskStatus::Cancelled;

        emit!(TaskCancelled { task: task.key() });

        Ok(())
    }
}

fn validate_claim(task: &TaskEscrow, now: i64) -> Result<()> {
    require!(task.status == TaskStatus::Open, RelayError::InvalidStatus);
    require!(now < task.expires_at, RelayError::TaskExpired);
    Ok(())
}

fn validate_submit(
    task: &TaskEscrow,
    worker: Pubkey,
    evidence_hash: [u8; 32],
) -> Result<()> {
    require!(
        task.status == TaskStatus::Claimed,
        RelayError::InvalidStatus
    );
    require_keys_eq!(task.worker, worker, RelayError::WrongWorker);
    require!(
        evidence_hash != [0; 32],
        RelayError::InvalidEvidenceHash
    );
    Ok(())
}

fn validate_accept(task: &TaskEscrow, poster: Pubkey) -> Result<()> {
    require!(
        task.status == TaskStatus::Delivered,
        RelayError::InvalidStatus
    );
    require_keys_eq!(task.poster, poster, RelayError::WrongPoster);
    Ok(())
}

fn validate_release(
    task: &TaskEscrow,
    worker: Pubkey,
    mint: Pubkey,
    vault_amount: u64,
) -> Result<()> {
    require!(
        task.status == TaskStatus::Accepted,
        RelayError::InvalidStatus
    );
    require_keys_eq!(task.worker, worker, RelayError::WrongWorker);
    require_keys_eq!(task.mint, mint, RelayError::WrongMint);
    require!(
        vault_amount >= task.reward_amount,
        RelayError::EscrowUnderfunded
    );
    Ok(())
}

fn validate_cancel(task: &TaskEscrow, poster: Pubkey, vault_amount: u64) -> Result<()> {
    require!(task.status == TaskStatus::Open, RelayError::InvalidStatus);
    require_keys_eq!(task.poster, poster, RelayError::WrongPoster);
    require!(
        vault_amount >= task.reward_amount,
        RelayError::EscrowUnderfunded
    );
    Ok(())
}

#[derive(Accounts)]
#[instruction(task_id: [u8; 32])]
pub struct PostTask<'info> {
    #[account(mut)]
    pub poster: Signer<'info>,

    #[account(
        init,
        payer = poster,
        space = 8 + TaskEscrow::INIT_SPACE,
        seeds = [b"task", poster.key().as_ref(), task_id.as_ref()],
        bump
    )]
    pub task: Account<'info, TaskEscrow>,

    pub mint: InterfaceAccount<'info, Mint>,

    #[account(
        mut,
        token::mint = mint,
        token::authority = poster,
        token::token_program = token_program
    )]
    pub poster_token: InterfaceAccount<'info, TokenAccount>,

    #[account(
        init,
        payer = poster,
        token::mint = mint,
        token::authority = task,
        token::token_program = token_program,
        seeds = [b"vault", task.key().as_ref()],
        bump
    )]
    pub vault: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ClaimTask<'info> {
    #[account(mut)]
    pub worker: Signer<'info>,

    #[account(mut)]
    pub task: Account<'info, TaskEscrow>,
}

#[derive(Accounts)]
pub struct SubmitEvidence<'info> {
    pub worker: Signer<'info>,

    #[account(mut)]
    pub task: Account<'info, TaskEscrow>,
}

#[derive(Accounts)]
pub struct AcceptTask<'info> {
    pub poster: Signer<'info>,

    #[account(mut)]
    pub task: Account<'info, TaskEscrow>,
}

#[derive(Accounts)]
pub struct ReleasePayment<'info> {
    pub worker: Signer<'info>,

    #[account(
        mut,
        seeds = [b"task", task.poster.as_ref(), task.task_id.as_ref()],
        bump = task.bump
    )]
    pub task: Account<'info, TaskEscrow>,

    pub mint: InterfaceAccount<'info, Mint>,

    #[account(
        mut,
        token::mint = mint,
        token::authority = task,
        token::token_program = token_program,
        seeds = [b"vault", task.key().as_ref()],
        bump = task.vault_bump
    )]
    pub vault: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        token::mint = mint,
        token::authority = worker,
        token::token_program = token_program
    )]
    pub worker_token: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Interface<'info, TokenInterface>,
}

#[derive(Accounts)]
pub struct CancelOpenTask<'info> {
    #[account(mut)]
    pub poster: Signer<'info>,

    #[account(
        mut,
        seeds = [b"task", task.poster.as_ref(), task.task_id.as_ref()],
        bump = task.bump
    )]
    pub task: Account<'info, TaskEscrow>,

    pub mint: InterfaceAccount<'info, Mint>,

    #[account(
        mut,
        token::mint = mint,
        token::authority = task,
        token::token_program = token_program,
        seeds = [b"vault", task.key().as_ref()],
        bump = task.vault_bump
    )]
    pub vault: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        token::mint = mint,
        token::authority = poster,
        token::token_program = token_program
    )]
    pub poster_token: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Interface<'info, TokenInterface>,
}

#[account]
#[derive(InitSpace)]
pub struct TaskEscrow {
    pub task_id: [u8; 32],
    pub poster: Pubkey,
    pub worker: Pubkey,
    pub mint: Pubkey,
    pub reward_amount: u64,
    pub expires_at: i64,
    pub status: TaskStatus,
    pub evidence_hash: [u8; 32],
    pub bump: u8,
    pub vault_bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, InitSpace, PartialEq, Eq)]
pub enum TaskStatus {
    Open,
    Claimed,
    Delivered,
    Accepted,
    Paid,
    Cancelled,
}

#[event]
pub struct TaskPosted {
    pub task: Pubkey,
    pub poster: Pubkey,
    pub mint: Pubkey,
    pub reward_amount: u64,
    pub expires_at: i64,
}

#[event]
pub struct TaskClaimed {
    pub task: Pubkey,
    pub worker: Pubkey,
}

#[event]
pub struct EvidenceSubmitted {
    pub task: Pubkey,
    pub worker: Pubkey,
    pub evidence_hash: [u8; 32],
}

#[event]
pub struct TaskAccepted {
    pub task: Pubkey,
    pub evidence_hash: [u8; 32],
}

#[event]
pub struct TaskPaid {
    pub task: Pubkey,
    pub worker: Pubkey,
    pub amount: u64,
    pub mint: Pubkey,
}

#[event]
pub struct TaskCancelled {
    pub task: Pubkey,
}

#[error_code]
pub enum RelayError {
    #[msg("Reward amount must be greater than zero")]
    ZeroReward,
    #[msg("Expiry must be in the future")]
    InvalidExpiry,
    #[msg("Task is not in the required state")]
    InvalidStatus,
    #[msg("Task has expired")]
    TaskExpired,
    #[msg("Signer is not the assigned worker")]
    WrongWorker,
    #[msg("Signer is not the task poster")]
    WrongPoster,
    #[msg("Token mint does not match the task")]
    WrongMint,
    #[msg("Evidence hash cannot be empty")]
    InvalidEvidenceHash,
    #[msg("Escrow vault is underfunded")]
    EscrowUnderfunded,
}


#[cfg(test)]
mod tests {
    use super::*;

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
            evidence_hash: [0; 32],
            bump: 255,
            vault_bump: 254,
        }
    }

    #[test]
    fn claim_requires_open_unexpired_task() {
        let open = sample_task(TaskStatus::Open);
        assert!(validate_claim(&open, 199).is_ok());
        assert!(validate_claim(&open, 200).is_err());

        let claimed = sample_task(TaskStatus::Claimed);
        assert!(validate_claim(&claimed, 199).is_err());
    }

    #[test]
    fn submit_requires_assigned_worker_and_nonzero_evidence() {
        let claimed = sample_task(TaskStatus::Claimed);
        assert!(validate_submit(&claimed, key(1), [7; 32]).is_ok());
        assert!(validate_submit(&claimed, key(4), [7; 32]).is_err());
        assert!(validate_submit(&claimed, key(1), [0; 32]).is_err());

        let open = sample_task(TaskStatus::Open);
        assert!(validate_submit(&open, key(1), [7; 32]).is_err());
    }

    #[test]
    fn accept_requires_delivery_and_original_poster() {
        let delivered = sample_task(TaskStatus::Delivered);
        assert!(validate_accept(&delivered, key(2)).is_ok());
        assert!(validate_accept(&delivered, key(4)).is_err());

        let claimed = sample_task(TaskStatus::Claimed);
        assert!(validate_accept(&claimed, key(2)).is_err());
    }

    #[test]
    fn release_requires_accepted_task_worker_mint_and_funding() {
        let accepted = sample_task(TaskStatus::Accepted);
        assert!(validate_release(&accepted, key(1), key(3), REWARD).is_ok());
        assert!(validate_release(&accepted, key(4), key(3), REWARD).is_err());
        assert!(validate_release(&accepted, key(1), key(4), REWARD).is_err());
        assert!(validate_release(&accepted, key(1), key(3), REWARD - 1).is_err());

        let delivered = sample_task(TaskStatus::Delivered);
        assert!(validate_release(&delivered, key(1), key(3), REWARD).is_err());
    }

    #[test]
    fn cancel_requires_open_task_poster_and_funding() {
        let open = sample_task(TaskStatus::Open);
        assert!(validate_cancel(&open, key(2), REWARD).is_ok());
        assert!(validate_cancel(&open, key(4), REWARD).is_err());
        assert!(validate_cancel(&open, key(2), REWARD - 1).is_err());

        let claimed = sample_task(TaskStatus::Claimed);
        assert!(validate_cancel(&claimed, key(2), REWARD).is_err());
    }
}
