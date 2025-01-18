use super::*;

#[account]
#[derive(Default, Debug)]
pub struct AuthorityManager {
    pub bump: u8,
    pub authority_bump: u8,
    pub admins: [Pubkey; 5],
}
impl AuthorityManager {
    pub const LEN: usize = 8 + std::mem::size_of::<Self>();

    pub fn admins_len(&self) -> usize {
        self.admins.len()
    }
    pub fn is_admin(&self, account: &Pubkey) -> bool {
        self.admins.contains(account)
    }

    pub fn set(&mut self, index: usize, admin: Pubkey) {
        self.admins[index] = admin;
    }

    pub fn remove(&mut self, index: usize) {
        self.admins[index] = Pubkey::default();
    }

    pub fn is_one_admin(&self) -> bool {
        let empty_address = Pubkey::default();
        let count = self.admins.iter().filter(|x| **x == empty_address).count();
        count == 1
    }
}
