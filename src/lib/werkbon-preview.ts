import type { werkbonMailData } from './werkbon-mail';

/** A preview must not bypass the crew's visibility settings. */
export function visibleWerkbonPreview(data: ReturnType<typeof werkbonMailData>, permissions: { showContact: boolean; showPrices: boolean }) {
  return {
    ...data,
    ...(!permissions.showContact ? { customer: 'Klant', address: null, siteAddress: null, vatNumber: null } : {}),
    paid: permissions.showPrices ? data.paid : null,
  };
}