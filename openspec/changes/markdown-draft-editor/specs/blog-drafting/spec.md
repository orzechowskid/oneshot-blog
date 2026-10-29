## Purpose

Gives the owner a Markdown drafting surface with a live rendered preview and a stored draft version that can be saved without changing the public post.

## ADDED Requirements

### Requirement: Markdown editor shows a live sanitized preview
The admin editor SHALL provide a Markdown body editor and a preview. The preview SHALL render the current draft text with the same Markdown rules and sanitization used for public posts.

#### Scenario: Preview follows the draft text
- **WHEN** the owner edits the Markdown body
- **THEN** the preview shows the current draft text rendered with the same Markdown rules and sanitization used for public posts

#### Scenario: Preview shows saved content when the editor opens
- **WHEN** the owner opens the editor for a post
- **THEN** the preview already shows the post's saved content: the attached draft if one is stored, otherwise the published content

#### Scenario: Wide-screen layout
- **WHEN** the editor is shown on a wide screen
- **THEN** the body editor and the preview appear side by side

#### Scenario: Narrow-screen toggle
- **WHEN** the editor is shown on a narrow screen
- **THEN** the owner can switch between editing and previewing without losing the draft text

#### Scenario: Formatting actions
- **WHEN** the owner triggers a formatting action with a toolbar button or a keyboard shortcut
- **THEN** the corresponding Markdown text is inserted into the body editor or wraps the selected text

### Requirement: A published post keeps its public address
A published post SHALL keep its public address. While editing a published post, the address control SHALL be read-only, and a submitted address value SHALL be ignored for a published post. New posts and draft-only posts SHALL keep an editable address. A draft-only post SHALL store its address in the same place a published post stores its address, so a stored draft holds its address against later posts.

#### Scenario: Editing a published post shows the address as read-only
- **WHEN** the owner opens the editor for a published post
- **THEN** the address control is read-only

#### Scenario: Publishing after editing keeps the public address
- **WHEN** the owner edits the title, body, and excerpt of a published post and publishes the draft
- **THEN** the post stays reachable at its original public address

#### Scenario: A submitted address value is ignored for a published post
- **WHEN** a save or publish for a published post includes an address value that differs from the post's current address
- **THEN** the post keeps its original address

#### Scenario: New posts and draft-only posts keep an editable address
- **WHEN** the owner opens the editor for a new post or a draft-only post
- **THEN** the address control is editable

#### Scenario: A stored draft holds its address against later posts
- **WHEN** a draft-only post is saved with an address, and the owner later saves a different post with the same address
- **THEN** the later post is saved with a different address, and the original draft keeps its address

### Requirement: Draft saves do not change published content
The system SHALL store a draft separately from the published content. Saving a draft on a published post SHALL NOT change the published title, address, body, excerpt, or publication times that readers see.

#### Scenario: Saving a draft on a published post
- **WHEN** the owner edits a published post and saves a draft
- **THEN** the public post keeps its existing title, address, body, excerpt, and publication times and stays visible on the public site

#### Scenario: Draft-only post is not on the public site
- **WHEN** the owner saves a draft for a new post
- **THEN** the post is stored as a draft and does not appear on the public site

#### Scenario: Draft-only post with a title and an empty body is stored
- **WHEN** the owner saves a draft for a new post that has a title and an empty body
- **THEN** the draft is stored

### Requirement: Drafts save explicitly and automatically
The system SHALL save a draft when the owner chooses **Save draft**. The system SHALL also save the draft automatically after three seconds of idle typing when a title is present. The editor SHALL show the draft's save state.

#### Scenario: Explicit draft save
- **WHEN** the owner chooses **Save draft**
- **THEN** the draft is persisted and the editor shows the saved state

#### Scenario: Idle autosave
- **WHEN** the owner stops typing for three seconds and the draft has a title
- **THEN** the draft is saved automatically and the editor shows the saved state

#### Scenario: Autosave on a new post creates one draft-only post
- **WHEN** the owner types in a new post and the automatic save fires
- **THEN** one draft-only post is created, and later automatic saves and explicit saves update that same post instead of creating new ones

#### Scenario: Incomplete draft with a title and an empty body is accepted
- **WHEN** the owner saves a draft that has a title and an empty body
- **THEN** the save succeeds and the draft is stored

#### Scenario: Autosave failure
- **WHEN** an automatic save fails
- **THEN** the editor shows an error and keeps the draft marked unsaved

#### Scenario: Autosave with an expired session
- **WHEN** an automatic save is attempted and the session has expired
- **THEN** the response reports an unauthenticated failure, the editor shows the failed-to-save state, and the draft text the owner typed is kept on screen

#### Scenario: The editor shows the save states
- **WHEN** a draft save is in progress, succeeds, leaves unsaved changes, or fails
- **THEN** the editor shows the matching state: saving, saved, unsaved, or failed to save

### Requirement: Unsaved edits are protected on reload and tab close
The editor SHALL warn the owner before unsaved edits are lost when the page reloads or the tab closes.

#### Scenario: Reloading with unsaved edits warns the owner
- **WHEN** the owner reloads the page while the editor has unsaved edits
- **THEN** the owner is warned before the unsaved edits are lost

#### Scenario: Closing the tab with unsaved edits warns the owner
- **WHEN** the owner closes the browser tab while the editor has unsaved edits
- **THEN** the owner is warned before the unsaved edits are lost

#### Scenario: In-app navigation is not guarded (explicit limit)
- **WHEN** the owner follows an in-app link while the editor has unsaved edits
- **THEN** the editor does not warn, and the unsaved edits are dropped

### Requirement: Publishing promotes the draft
The system SHALL make a draft the published content only when the owner chooses **Publish** and the draft passes validation. Publishing SHALL replace the published content with the draft content, mark the post as published, clear the draft, and update the publication times.

#### Scenario: First publication
- **WHEN** the owner publishes a draft-only post with a non-empty body
- **THEN** the post becomes visible on the public site at the address the draft holds, the first publication time is recorded, and the draft is cleared

#### Scenario: Publishing a draft-only post publishes the stored values
- **WHEN** the owner publishes a draft-only post
- **THEN** the content, the address, and the excerpt already stored on that row are the values that become public, and no value is taken from an empty draft field

#### Scenario: Republishing a published post with a draft
- **WHEN** the owner publishes a draft attached to an already published post
- **THEN** the published content is replaced by the draft content, the last publication time moves, the first publication time stays unchanged, and the draft is cleared

#### Scenario: Empty body cannot be published
- **WHEN** the owner chooses **Publish** while the draft body is empty
- **THEN** the publish is rejected with a validation error and the draft remains stored

#### Scenario: Publish with any other failing validation is rejected
- **WHEN** the owner chooses **Publish** and another validation fails, such as a title or body length limit
- **THEN** the publish is rejected with a validation error and the draft remains stored

#### Scenario: Publish is unavailable on a published post with no attached draft
- **WHEN** the owner opens the editor for a published post that has no attached draft
- **THEN** the **Publish** action is unavailable

### Requirement: Discard a draft
A published post with an attached draft SHALL provide a **Discard draft** action that clears the draft and leaves the published post live and unchanged. A draft-only post SHALL NOT provide a discard action.

#### Scenario: Discarding a draft on a published post
- **WHEN** the owner chooses **Discard draft** on a published post with an attached draft
- **THEN** the draft is cleared and the published post stays live with its existing content

#### Scenario: A draft-only post has no discard action
- **WHEN** the owner opens the editor for a draft-only post
- **THEN** no discard action is shown, and the post is removed only through the existing whole-post delete

### Requirement: Admin list shows draft attachment and last change
The admin list SHALL show every post and its state: published, draft, or published with a draft attached. The time column SHALL show the post's last change: the draft save time when a draft is attached, the last publication time for a published post without a draft, and the last save time for a draft-only post. The column header SHALL name the column as the last change.

#### Scenario: Published post with a draft
- **WHEN** a published post has an attached draft
- **THEN** the list shows the post as published with a draft attached, and the time column shows the draft save time

#### Scenario: Draft-only post
- **WHEN** a post has never been published
- **THEN** the list shows the post as a draft, and the time column shows its last save time

#### Scenario: Published post without a draft
- **WHEN** a published post has no attached draft
- **THEN** the list shows the post as published, and the time column shows the last publication time

#### Scenario: The View control appears only for published posts
- **WHEN** the owner views the admin list
- **THEN** the View control is shown only for published posts

#### Scenario: The column header names the last change
- **WHEN** the owner views the admin list
- **THEN** the time column header names the time as the post's last change

#### Scenario: Saving a draft on a draft-only post moves its row
- **WHEN** the owner saves a draft on a draft-only post
- **THEN** the post's row moves in the list to the position ordered by its new last change time

### Requirement: Public posts expose only published content
Public post views SHALL show only the published content. Draft content SHALL NOT appear on the public site, in public listings, or at public addresses.

#### Scenario: A reader sees published content, not the attached draft
- **WHEN** a reader opens a published post that has an attached draft
- **THEN** the reader sees the published content, not the draft content

#### Scenario: An address belonging to an unpublished draft is not found
- **WHEN** a reader requests an address that belongs only to an unpublished draft
- **THEN** the post is not found on the public site

#### Scenario: A published post keeps its address while a draft is attached
- **WHEN** a reader opens a published post while a draft is attached to it
- **THEN** the post is served at its original public address

### Requirement: Publication state changes only through Publish
The publication state of a post SHALL change only through the **Publish** action. The admin editor SHALL provide no control that takes a published post off the public site.

#### Scenario: The admin editor shows no control that removes a published post
- **WHEN** the owner opens the editor for a published post
- **THEN** no control is shown that takes the post off the public site

#### Scenario: A published post stays public until it is published again
- **WHEN** a post is published
- **THEN** the post stays on the public site, and publishing again replaces its content while keeping the post public at the same address

### Requirement: Validation preserves existing limits
Draft saves SHALL require a title and SHALL allow an empty body. Publishing SHALL require a non-empty body. The title, body, and excerpt length limits SHALL be enforced on both draft saves and publishing. Existing address rules SHALL be preserved.

#### Scenario: Draft save without a title is rejected
- **WHEN** the owner saves a draft with no title
- **THEN** the save is rejected with a title error, and no address error is shown

#### Scenario: Draft with an empty body is accepted
- **WHEN** the owner saves a draft that has a title and an empty body
- **THEN** the save succeeds

#### Scenario: Publish with an empty body is rejected and the draft is kept
- **WHEN** the owner chooses **Publish** while the body is empty
- **THEN** the publish is rejected with a body error and the draft remains stored

#### Scenario: Body, excerpt, and title length limits are enforced on both draft save and publish
- **WHEN** the title, body, or excerpt exceeds its length limit
- **THEN** a draft save is rejected and a publish is rejected, each with the matching length error

#### Scenario: A draft save whose address is taken appends a numeric suffix
- **WHEN** the owner saves a draft whose address is already taken by another post
- **THEN** the system appends a numeric suffix to the address, the draft is saved, and the editor shows the resulting address

#### Scenario: A draft save that cannot obtain a free address is rejected
- **WHEN** a draft save cannot obtain a free address because the collision attempts are exhausted
- **THEN** the save is rejected with an address error naming the address, and no server error is shown to the owner

#### Scenario: A published post ignores a submitted address
- **WHEN** a save or publish for a published post includes an address value that differs from the post's current address
- **THEN** the post keeps its original address
