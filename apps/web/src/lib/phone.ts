/** Côte d'Ivoire numbering: +225 followed by 10 digits (since 2021). */
export const CI_DIAL_CODE = "+225";
export const CI_LOCAL_LENGTH = 10;

/** Mobile (01 Moov, 05 MTN, 07 Orange) and fixed-line (21, 25, 27) prefixes. */
const CI_LOCAL_PATTERN = /^(01|05|07|21|25|27)\d{8}$/;

export const CI_PHONE_EXAMPLE = "07 12 34 56 78";

/** Normalise any user input or stored E.164 value to the 10 local digits. */
export function toCiLocalDigits(input: string | null | undefined): string {
  if (!input) return "";
  let digits = input.replace(/\D/g, "");
  if (digits.startsWith("00225")) digits = digits.slice(5);
  else if (digits.startsWith("225") && digits.length > CI_LOCAL_LENGTH) digits = digits.slice(3);
  return digits.slice(0, CI_LOCAL_LENGTH);
}

/** "0712345678" → "07 12 34 56 78" */
export function formatCiLocal(digits: string): string {
  return digits.replace(/(\d{2})(?=\d)/g, "$1 ");
}

export function isValidCiLocal(digits: string): boolean {
  return CI_LOCAL_PATTERN.test(digits);
}

export function ciLocalToE164(digits: string): string {
  return `${CI_DIAL_CODE}${digits}`;
}

/** True when a stored E.164 number belongs to Côte d'Ivoire. */
export function isCiE164(value: string | null | undefined): boolean {
  return Boolean(value && value.startsWith(CI_DIAL_CODE));
}

export const CI_PHONE_ERROR =
  "Numéro ivoirien invalide : 10 chiffres commençant par 01, 05, 07, 21, 25 ou 27 (ex. 07 12 34 56 78).";
