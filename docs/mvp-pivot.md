# WhispList MVP Pivot (Creator Feed + Community Funding)

## Product focus
Build only one clear loop:
1. Creator posts a support request with photo/video and story.
2. Community discovers requests in a scrolling feed.
3. Supporters contribute money or send gifts.
4. Creator tracks active requests on profile.

## Core screens
- `Feed` (`/app/(tabs)/index.tsx`): support-only content stream.
- `Create` (`/app/journal.tsx` via tab route): publish money/gift/both request.
- `Profile` (`/app/(tabs)/profile/index.tsx`): creator summary + posted requests.

## Simplified request model
Use a narrow subset of `wishes` for launch:
- `type`: `support`
- `text`: why the creator needs help (story)
- `supportRequest.reason`: what they need
- `fundingGoal` / `fundingRaised` / `fundingSupporters`: money progress
- `giftLabel` + `giftLink`: gift request metadata
- `imageUrl` / `videoUrl`: post media
- `displayName` / `photoURL` / `userId` / `timestamp`

## Intentionally de-prioritized for fast launch
- Journal prompts, streaks, and reflection analytics
- Boosting and leaderboard surfaces
- Segmented feed modes (trending/boosted/for-you)
- Complex composer options (polls, auto-delete, accountability circles)
- Inbox-first navigation (messages/notifications as primary tab)
- Subscription/paywall-specific UI in primary paths

## Next phase (after MVP traction)
- Native in-app payment flow optimization
- Creator trust and verification workflow
- Moderation automation + reviewer tooling
- Video playback improvements and richer media controls
