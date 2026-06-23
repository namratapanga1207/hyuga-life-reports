export const SUMMARY_HEADERS = {
  month: "Month",
  chatClicks:
    'Total users Clicked "chat with nutritionist" on BOT',
  entryPoint1:
    "Hi I'm looking for Nutritionist advice for my health wellness needs",
  entryPoint2: "Hi I need help with",
} as const;

export const TICKET_HEADERS = {
  month: "Month",
  phoneNumber: "Phone Number",
  ticketLink: "Ticket Link",
  firstMessage: "First Message",
  entryType: "Entry Type",
  clickedNutritionist: 'Clicked Chat with Nutritionist',
  ticketId: "Ticket ID",
  level1Tags: "Level 1 Tags",
  level2Tags: "Level 2 Tags",
  systemTags: "System Tags",
} as const;
