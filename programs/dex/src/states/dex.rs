use anchor_lang::prelude::*;
use anchor_spl::token_interface::Mint;

use crate::curve::TradeDirection;

pub const Q32: u128 = (u32::MAX as u128) + 1; // 2^32

#[account(zero_copy(unsafe))]
#[repr(packed)]
#[derive(Default, Debug)]
pub struct DexState {
    /// pool creator
    pub pool_creator: Pubkey,
    /// Token A
    pub token_0_vault: Pubkey,
    /// Token B
    pub token_1_vault: Pubkey,

    pub is_launched: bool,
    pub is_ready_to_launch: bool,
    // if false for vault_0 , true for vault_1
    pub vault_for_reserve_bound: bool,
    // if false condition gte , true for vault_1
    pub vault_reserve_bound: u64,

    /// Mint information for token A
    pub token_0_mint: Pubkey,
    /// Mint information for token B
    pub token_1_mint: Pubkey,

    /// token_0 program
    pub token_0_program: Pubkey,
    /// token_1 program
    pub token_1_program: Pubkey,

    /// mint0 and mint1 decimals
    pub mint_0_decimals: u8,
    pub mint_1_decimals: u8,

    /// The fees amounts of token_0 and token_1
    pub swap_fees_token_0: u64,
    pub swap_fees_token_1: u64,
    pub launch_fees_token_0: u64,
    pub launch_fees_token_1: u64,
}

impl DexState {
    pub const LEN: usize = 8 + std::mem::size_of::<Self>();

    pub fn initialize(
        &mut self,
        pool_creator: Pubkey,
        token_0_vault: Pubkey,
        token_1_vault: Pubkey,
        token_0_mint: &InterfaceAccount<Mint>,
        token_1_mint: &InterfaceAccount<Mint>,
        vault_for_reserve_bound: bool,
        vault_reserve_bound: u64,
    ) {
        self.pool_creator = pool_creator.key();
        self.token_0_vault = token_0_vault;
        self.token_1_vault = token_1_vault;
        self.is_launched = false;
        self.vault_reserve_bound = vault_reserve_bound;
        self.vault_for_reserve_bound = vault_for_reserve_bound;
        self.token_0_mint = token_0_mint.key();
        self.token_1_mint = token_1_mint.key();
        self.token_0_program = *token_0_mint.to_account_info().owner;
        self.token_1_program = *token_1_mint.to_account_info().owner;
        self.swap_fees_token_0 = 0;
        self.swap_fees_token_1 = 0;
        self.launch_fees_token_0 = 0;
        self.launch_fees_token_1 = 0;
    }

    pub fn vault_amount_without_fee(&self, vault_0: u64, vault_1: u64) -> (u64, u64) {
        (
            vault_0.checked_sub(self.swap_fees_token_0).unwrap(),
            vault_1.checked_sub(self.swap_fees_token_1).unwrap(),
        )
    }

    pub fn token_price_x32(&self, vault_0: u64, vault_1: u64) -> (u128, u128) {
        let (token_0_amount, token_1_amount) = self.vault_amount_without_fee(vault_0, vault_1);
        (
            token_1_amount as u128 * Q32 / token_0_amount as u128,
            token_0_amount as u128 * Q32 / token_1_amount as u128,
        )
    }
    pub fn get_vault_reserve_amount(
        &self,
        input_vault: u64,
        output_vault: u64,
        trade_direction: TradeDirection,
    ) -> u64 {
        let (vault_0, vault_1) = match trade_direction {
            TradeDirection::ZeroForOne => (input_vault, output_vault),
            TradeDirection::OneForZero => (output_vault, input_vault),
        };

        if self.vault_for_reserve_bound {
            vault_1
        } else {
            vault_0
        }
    }

    pub fn is_reached_reserve_bound(&self, amount: u64) -> bool {
        amount >= self.vault_reserve_bound
    }

    pub fn get_remaining_tokens(&self, vault_reserve_amount: u64) -> u64 {
        self.vault_reserve_bound
            .checked_sub(vault_reserve_amount)
            .unwrap_or_default()
    }
}
