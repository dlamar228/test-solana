use super::*;

use bytemuck::{Pod, Zeroable};

#[account]
#[derive(Default, Debug)]
pub struct FaucetClaim {
    pub mint: Pubkey,
    pub claim_starts: u64,
    pub claim_ends: u64,
    pub total_faucet_amount: u64,
    pub total_claimed_amount: u64,
    pub shards: u16,
    pub bump: u8,
}

impl FaucetClaim {
    pub const LEN: usize = 8 + std::mem::size_of::<FaucetClaim>();

    pub fn is_finished(&self, now: u64) -> bool {
        now > self.claim_ends
    }
    pub fn is_started(&self, now: u64) -> bool {
        now > self.claim_starts
    }

    pub fn rest_amount(&self) -> u64 {
        self.total_faucet_amount - self.total_claimed_amount
    }
}

#[account(zero_copy)]
#[derive(Default, Debug)]
#[repr(C)]
pub struct FaucetClaimShard {
    pub index: u16,
    pub padding: u8,
    pub bump: u8,
    pub merkle_root: [u8; 32],
    pub faucet_claim: Pubkey,
    pub bitmap: ShardClaimBitMap,
}

impl FaucetClaimShard {
    pub const LEN: usize = 8 + std::mem::size_of::<Self>();
}

#[derive(Debug, AnchorSerialize, AnchorDeserialize, Clone, Copy, Pod, Zeroable)]
#[repr(C)]
pub struct ShardClaimBitMap {
    pub bitmap: [u32; 2048],
}

impl Default for ShardClaimBitMap {
    fn default() -> Self {
        Self {
            bitmap: [0u32; 2048],
        }
    }
}

impl ShardClaimBitMap {
    pub const LEN: usize = std::mem::size_of::<Self>();
    const fn byte_index(index: u16) -> usize {
        (index >> 5) as usize
    }
    const fn bit_offset(index: u16) -> u32 {
        (index & 31) as u32
    }

    pub const fn check(&self, index: u16) -> bool {
        self.bitmap[Self::byte_index(index)] & (1 << Self::bit_offset(index)) != 0
    }

    pub fn enable(&mut self, index: u16) {
        self.bitmap[Self::byte_index(index)] |= 1 << Self::bit_offset(index);
    }
    pub fn disable(&mut self, index: u16) {
        self.bitmap[Self::byte_index(index)] &= !(1 << Self::bit_offset(index));
    }
}
