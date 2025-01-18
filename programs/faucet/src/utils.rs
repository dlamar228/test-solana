use crate::error::ErrorCode;
use anchor_lang::prelude::*;
use anchor_spl::{
    token::Token,
    token_2022::{
        self,
        spl_token_2022::{
            self,
            extension::{transfer_fee::TransferFeeConfig, StateWithExtensions},
        },
    },
    token_interface::spl_token_2022::extension::BaseStateWithExtensions,
};

pub struct TokenUtils<'info> {
    pub token_program: AccountInfo<'info>,
    pub mint: AccountInfo<'info>,
    pub decimals: u8,
}

impl<'info> TokenUtils<'info> {
    pub fn get_transfer_fee(mint: &AccountInfo, pre_fee_amount: u64) -> Result<u64> {
        if *mint.owner == Token::id() {
            return Ok(0);
        }
        let mint_data = mint.try_borrow_data()?;
        let mint = StateWithExtensions::<spl_token_2022::state::Mint>::unpack(&mint_data)?;

        let fee = match mint.get_extension::<TransferFeeConfig>() {
            Ok(transfer_fee_config) => transfer_fee_config
                .calculate_epoch_fee(Clock::get()?.epoch, pre_fee_amount)
                .ok_or(ErrorCode::FiledCalculateTransferFee)?,
            _ => 0,
        };

        Ok(fee)
    }
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
}
