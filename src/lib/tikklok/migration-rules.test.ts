import { describe, expect, it } from 'vitest';
import { isTikklokSender, migrationPinSchema } from './migration-rules';

describe('Tikklokoverdracht', () => {
  it('behoudt bestaande pincodes met vier tot acht cijfers', () => {
    const employeeId = '00000000-0000-4000-8000-000000000001';
    expect(migrationPinSchema.parse({ employeeId, pin: '0123' }).pin).toBe('0123');
    expect(migrationPinSchema.safeParse({ employeeId, pin: '12345678' }).success).toBe(true);
    expect(migrationPinSchema.safeParse({ employeeId, pin: '123' }).success).toBe(false);
    expect(migrationPinSchema.safeParse({ employeeId, pin: '123456789' }).success).toBe(false);
  });
  it('houdt personeelsmails op info en niet op de facturatiemailbox', () => {
    expect(isTikklokSender('INFO@RIORY.BE')).toBe(true);
    expect(isTikklokSender('boekhouding@riory.be')).toBe(false);
    expect(isTikklokSender(null)).toBe(false);
  });
});