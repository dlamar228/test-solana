use anchor_lang::prelude::*;
use anchor_spl::token_2022;

pub struct TokenUtils<'info> {
    pub token_program: AccountInfo<'info>,
    pub mint: AccountInfo<'info>,
    pub decimals: u8,
}

impl<'info> TokenUtils<'info> {
    pub fn transfer(
        &self,
        authority: AccountInfo<'info>,
        from: AccountInfo<'info>,
        to: AccountInfo<'info>,
        amount: u64,
    ) -> Result<()> {
        if amount == 0 {
            return Ok(());
        }

        token_2022::transfer_checked(
            CpiContext::new(
                self.token_program.clone(),
                token_2022::TransferChecked {
                    from,
                    to,
                    authority,
                    mint: self.mint.clone(),
                },
            ),
            amount,
            self.decimals,
        )
    }
    pub fn transfer_signer(
        &self,
        authority: AccountInfo<'info>,
        from: AccountInfo<'info>,
        to: AccountInfo<'info>,
        amount: u64,
        signer_seeds: &[&[&[u8]]],
    ) -> Result<()> {
        if amount == 0 {
            return Ok(());
        }

        token_2022::transfer_checked(
            CpiContext::new_with_signer(
                self.token_program.clone(),
                token_2022::TransferChecked {
                    from,
                    to,
                    authority,
                    mint: self.mint.clone(),
                },
                signer_seeds,
            ),
            amount,
            self.decimals,
        )
    }

    pub fn mint_to(
        &self,
        authority: AccountInfo<'info>,
        to: AccountInfo<'info>,
        amount: u64,
        signer_seeds: &[&[&[u8]]],
    ) -> Result<()> {
        if amount == 0 {
            return Ok(());
        }

        token_2022::mint_to(
            CpiContext::new_with_signer(
                self.token_program.clone(),
                token_2022::MintTo {
                    authority,
                    mint: self.mint.clone(),
                    to,
                },
                signer_seeds,
            ),
            amount,
        )
    }
}
