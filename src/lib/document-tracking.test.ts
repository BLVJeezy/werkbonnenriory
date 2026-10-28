import { describe,it,expect } from 'vitest';
import { documentLink, mayOpenDocument, tokenHash } from './document-tracking';
describe('beveiligde documentopeningen', () => {
 it('gebruikt de gepubliceerde klantlink', () => expect(documentLink('abc')).toBe('https://werkbonnenriory.lovable.app/document/abc'));
 it('weigert voorbereide documenten', () => expect(mayOpenDocument('prepared','2027-10-28',Date.parse('2026-10-28'))).toBe(false));
 it('weigert vervallen links', () => expect(mayOpenDocument('accepted','2026-10-27',Date.parse('2026-10-28'))).toBe(false));
 it('laat aanvaarde documenten toe', () => expect(mayOpenDocument('accepted','2027-10-28',Date.parse('2026-10-28'))).toBe(true));
 it('laat onzekere verzending toe zonder aflevering te claimen', () => expect(mayOpenDocument('uncertain','2027-10-28',Date.parse('2026-10-28'))).toBe(true));
 it('bewaart een hash in plaats van de geheime link', async () => { expect(await tokenHash('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'); });
});