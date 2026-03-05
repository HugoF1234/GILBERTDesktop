export type OrganizationsNavigationIntent = {
  source?: 'shared-meeting' | 'contact' | 'organization';
  organizationId?: string | null;
  conversationKeys?: Array<string | null | undefined>;
  meetingId?: string;
  contactName?: string | null;
};

export const NAVIGATE_TO_ORGANIZATIONS_EVENT = 'navigateToOrganizations';

export const emitNavigateToOrganizations = (intent: OrganizationsNavigationIntent) => {
  window.dispatchEvent(
    new CustomEvent<OrganizationsNavigationIntent>(NAVIGATE_TO_ORGANIZATIONS_EVENT, {
      detail: intent,
    })
  );
};

