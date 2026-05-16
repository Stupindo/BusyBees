# Project TODO & Technical Debt

### Family Invitations & Join Codes

- **Join Code Rotation**: Implement a way to reset or regenerate a family's `join_code` if it gets shared with unauthorized people outside the family.
- **Pending Approvals**: Currently, joining with a code grants immediate access. Consider adding a "Pending Approval" state so a new member must be confirmed by an admin/parent before they can see chores and balances.
- make daily penalties different from weekly penalties. Probably need to add individual penalties for each chore to override family settings.
- show future daily chores in a separate section on the dashboard
+ add an avatar selector to the profile screen
- add some chore templates so when parents initiate the family setaup from scratch they could select some defaults instead of typing everything from scratch;
- Review the privacy aspect of using a public Supabase Storage bucket for chore photos (consider moving to a private bucket with signed URLs).
