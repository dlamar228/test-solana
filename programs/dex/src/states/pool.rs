use anchor_lang::prelude::*;
use anchor_spl::token_interface::Mint;
/// Seed to derive account address and signature
pub const DEX_SEED: &str = "dex_state";
pub const DEX_VAULT_SEED: &str = "dex_vault";

pub const Q32: u128 = (u32::MAX as u128) + 1; // 2^32

#[account(zero_copy(unsafe))]
#[repr(packed)]
#[derive(Default, Debug)]
pub struct DexState {
    /// Which config the pool belongs
    pub amm_config: Pubkey,
    /// pool creator
    pub pool_creator: Pubkey,
    /// Token A
    pub token_0_vault: Pubkey,
    /// Token B
    pub token_1_vault: Pubkey,

    pub is_launched: bool,
    pub vault_0_reserve_bound: u64,

    /// raydium lp mint
    pub lp_mint: Pubkey,
    /// raydium pool state
    pub raydium: Pubkey,
    /// Mint information for token A
    pub token_0_mint: Pubkey,
    /// Mint information for token B
    pub token_1_mint: Pubkey,

    /// token_0 program
    pub token_0_program: Pubkey,
    /// token_1 program
    pub token_1_program: Pubkey,

    pub auth_bump: u8,

    /// mint0 and mint1 decimals
    pub mint_0_decimals: u8,
    pub mint_1_decimals: u8,

    /// The amounts of token_0 and token_1 that are owed to the liquidity provider.
    pub protocol_fees_token_0: u64,
    pub protocol_fees_token_1: u64,

    /// The timestamp allowed for swap in the pool.
    pub open_time: u64,
    /// recent epoch
    pub recent_epoch: u64,
    /// padding for future updates
    pub padding: [u64; 31],
}

impl DexState {
    pub const LEN: usize = 8 + std::mem::size_of::<DexState>();

    pub fn initialize(
        &mut self,
        auth_bump: u8,
        open_time: u64,
        pool_creator: Pubkey,
        amm_config: Pubkey,
        token_0_vault: Pubkey,
        token_1_vault: Pubkey,
        token_0_mint: &InterfaceAccount<Mint>,
        token_1_mint: &InterfaceAccount<Mint>,
        raydium: Pubkey,
        vault_0_reserve_bound: u64,
    ) {
        self.amm_config = amm_config.key();
        self.pool_creator = pool_creator.key();
        self.token_0_vault = token_0_vault;
        self.token_1_vault = token_1_vault;
        self.is_launched = false;
        self.vault_0_reserve_bound = vault_0_reserve_bound;
        self.raydium = raydium;
        self.token_0_mint = token_0_mint.key();
        self.token_1_mint = token_1_mint.key();
        self.token_0_program = *token_0_mint.to_account_info().owner;
        self.token_1_program = *token_1_mint.to_account_info().owner;
        self.auth_bump = auth_bump;
        self.protocol_fees_token_0 = 0;
        self.protocol_fees_token_1 = 0;
        self.open_time = open_time;
        self.recent_epoch = Clock::get().unwrap().epoch;
        self.padding = [0u64; 31];
    }

    pub fn vault_amount_without_fee(&self, vault_0: u64, vault_1: u64) -> (u64, u64) {
        (
            vault_0.checked_sub(self.protocol_fees_token_0).unwrap(),
            vault_1.checked_sub(self.protocol_fees_token_1).unwrap(),
        )
    }

    pub fn token_price_x32(&self, vault_0: u64, vault_1: u64) -> (u128, u128) {
        let (token_0_amount, token_1_amount) = self.vault_amount_without_fee(vault_0, vault_1);
        (
            token_1_amount as u128 * Q32 / token_0_amount as u128,
            token_0_amount as u128 * Q32 / token_1_amount as u128,
        )
    }
}
