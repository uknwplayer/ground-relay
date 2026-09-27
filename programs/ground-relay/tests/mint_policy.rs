use anchor_lang::prelude::Pubkey;
use ground_relay::validate_new_escrow_mint_policy;

fn key(byte: u8) -> Pubkey {
    Pubkey::new_from_array([byte; 32])
}

#[test]
fn new_escrow_accepts_classic_unfreezable_mint() {
    assert!(validate_new_escrow_mint_policy(anchor_spl::token::ID, false).is_ok());
}

#[test]
fn new_escrow_rejects_non_classic_token_program() {
    assert!(validate_new_escrow_mint_policy(key(77), false).is_err());
}

#[test]
fn new_escrow_rejects_freeze_authority() {
    assert!(validate_new_escrow_mint_policy(anchor_spl::token::ID, true).is_err());
}
