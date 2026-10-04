import { and, desc, eq, gt, isNull } from '@roms/database';
import { otpCodes, users } from '@roms/database';
import type { OtpPurpose } from '@roms/contracts/auth';
import { AppError, addSeconds, err, ok, type Result } from '@roms/utils';
import type { AppDeps } from '../../app/deps';
import { issueOtpCode, sha256Hex } from '../../lib/tokens';

const OTP_TTL_SECONDS = 600;
const MAX_ATTEMPTS = 5;

const OTP_SUBJECT: Record<OtpPurpose, string> = {
  EMAIL_VERIFICATION: 'Verify your email',
  LOGIN: 'Your login code',
  PASSWORD_RESET: 'Your password reset code'
};

export const requestOtp = async (
  deps: AppDeps,
  identifier: string,
  purpose: OtpPurpose
): Promise<void> => {
  const { code, hash } = await issueOtpCode(6);
  await deps.db.insert(otpCodes).values({
    identifier,
    purpose,
    codeHash: hash,
    expiresAt: addSeconds(new Date(), OTP_TTL_SECONDS)
  });
  await deps.email.send({
    to: identifier,
    subject: `ROMS: ${OTP_SUBJECT[purpose]}`,
    text: `Your one-time code is ${code}. It expires in ${Math.round(OTP_TTL_SECONDS / 60)} minutes.`
  });
};

export type OtpVerification = { userId: string | null };

export const verifyOtp = async (
  deps: AppDeps,
  identifier: string,
  purpose: OtpPurpose,
  code: string
): Promise<Result<OtpVerification, AppError>> => {
  const rows = await deps.db
    .select()
    .from(otpCodes)
    .where(
      and(
        eq(otpCodes.identifier, identifier),
        eq(otpCodes.purpose, purpose),
        isNull(otpCodes.consumedAt),
        gt(otpCodes.expiresAt, new Date())
      )
    )
    .orderBy(desc(otpCodes.createdAt))
    .limit(1);

  const otp = rows[0];
  if (!otp) {
    return err(AppError.unprocessable('token_invalid', 'Code is invalid or expired'));
  }
  if (otp.attempts >= MAX_ATTEMPTS) {
    return err(AppError.unprocessable('rate_limited', 'Too many attempts for this code'));
  }

  const matches = (await sha256Hex(code)) === otp.codeHash;
  if (!matches) {
    await deps.db
      .update(otpCodes)
      .set({ attempts: otp.attempts + 1 })
      .where(eq(otpCodes.id, otp.id));
    return err(AppError.unprocessable('token_invalid', 'Code is invalid or expired'));
  }

  await deps.db.update(otpCodes).set({ consumedAt: new Date() }).where(eq(otpCodes.id, otp.id));

  if (purpose === 'EMAIL_VERIFICATION') {
    await deps.db
      .update(users)
      .set({ emailVerifiedAt: new Date() })
      .where(eq(users.email, identifier));
  }

  const userRows = await deps.db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, identifier))
    .limit(1);

  return ok({ userId: userRows[0]?.id ?? null });
};
