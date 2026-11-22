"use client";

import { CI_DIAL_CODE, CI_PHONE_EXAMPLE, formatCiLocal, toCiLocalDigits } from "@/lib/phone";

type PhoneInputProps = {
  id: string;
  /** The 10 local digits, without +225. */
  value: string;
  onChange: (digits: string) => void;
  required?: boolean;
  invalid?: boolean;
  describedBy?: string;
};

export function PhoneInput({ id, value, onChange, required, invalid, describedBy }: PhoneInputProps) {
  return (
    <div className={`phone-field${invalid ? " is-invalid" : ""}`}>
      <span className="phone-field__prefix" aria-hidden="true">
        CI {CI_DIAL_CODE}
      </span>
      <input
        id={id}
        type="tel"
        inputMode="numeric"
        autoComplete="tel-national"
        className="phone-field__input"
        placeholder={CI_PHONE_EXAMPLE}
        required={required}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        value={formatCiLocal(value)}
        onChange={(e) => onChange(toCiLocalDigits(e.target.value))}
      />
    </div>
  );
}
