import { Metadata } from 'next';
import { MarketplaceClient } from './marketplace-client';

export const metadata: Metadata = {
  title: 'Property Operations, Listing Monetization & Marketplace | Odibrick Management',
  description: 'Manage listing inventory, moderation, visibility tiers, monetization packages, leads attribution, and marketplace governance.',
};

export default function MarketplacePage() {
  return <MarketplaceClient />;
}
