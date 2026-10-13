export interface paths {
    "/api/me": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get the signed-in person
         * @description Any signed-in person.
         */
        get: operations["getMe"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/auth/sign-up": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Create an account and sign in
         * @description Starts a session: the response sets the `dr_session` cookie and the `dr_csrf` cookie. A workspace member added by this email while it had no account becomes active.
         *
         *     No sign-in needed.
         */
        post: operations["signUp"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/auth/sign-in": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Sign in
         * @description Rotates the session. Wrong email and wrong password get the same `401 unauthenticated`, so the response never says which accounts exist.
         *
         *     No sign-in needed.
         */
        post: operations["signIn"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/auth/sign-out": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Sign out
         * @description Ends the session on the server and clears both cookies. Open collaboration connections of the session close.
         *
         *     Any signed-in person.
         */
        post: operations["signOut"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/workspaces": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List the caller's workspaces
         * @description Any signed-in person.
         */
        get: operations["listWorkspaces"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/workspaces/{workspaceId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get a workspace
         * @description Required workspace role. Read the workspace, its members, folders and lists: member, owner.
         */
        get: operations["getWorkspace"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /**
         * Rename a workspace
         * @description Required workspace role. Rename the workspace: owner.
         */
        patch: operations["updateWorkspace"];
        trace?: never;
    };
    "/api/workspaces/{workspaceId}/members": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List the members of a workspace
         * @description Includes pending members.
         *
         *     Required workspace role. Read the workspace, its members, folders and lists: member, owner.
         */
        get: operations["listMembers"];
        put?: never;
        /**
         * Add a member by email
         * @description The member is `pending` until that email signs up. Adding an email that already belongs to the workspace is a `409 conflict`.
         *
         *     Required workspace role. Add, change role or remove members: owner.
         */
        post: operations["addMember"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/workspaces/{workspaceId}/members/{userId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /**
         * Remove a member
         * @description The person loses access to every document of the workspace and their open collaboration connections close. Removing the last owner is a `409 last-owner`.
         *
         *     Required workspace role. Add, change role or remove members: owner.
         */
        delete: operations["removeMember"];
        options?: never;
        head?: never;
        /**
         * Change a member's role
         * @description Demoting the last owner is a `409 last-owner`.
         *
         *     Required workspace role. Add, change role or remove members: owner.
         */
        patch: operations["updateMember"];
        trace?: never;
    };
    "/api/workspaces/{workspaceId}/folders": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List the folders of a workspace
         * @description Required workspace role. Read the workspace, its members, folders and lists: member, owner.
         */
        get: operations["listFolders"];
        put?: never;
        /**
         * Create a folder
         * @description Required workspace role. Create documents and folders: member, owner.
         */
        post: operations["createFolder"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/folders/{folderId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /**
         * Delete an empty folder
         * @description A folder that still holds documents, archived ones included, is a `409 conflict`.
         *
         *     Required workspace role. Rename and delete folders: member, owner.
         */
        delete: operations["deleteFolder"];
        options?: never;
        head?: never;
        /**
         * Rename a folder
         * @description A stale `revision` is a `409 revision-conflict` carrying the current folder.
         *
         *     Required workspace role. Rename and delete folders: member, owner.
         */
        patch: operations["updateFolder"];
        trace?: never;
    };
    "/api/workspaces/{workspaceId}/documents": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List and search documents
         * @description Only documents the caller can read. With `archived=true`, the archived documents the caller owns. Ordered by `updatedAt` descending, then `id` descending.
         *
         *     Required workspace role. Read the workspace, its members, folders and lists: member, owner.
         */
        get: operations["listDocuments"];
        put?: never;
        /**
         * Create a document
         * @description The caller gets an explicit `owner` grant and `generalAccess` starts at `none`. With `templateId`, the document starts from that template in the language of the template list.
         *
         *     Required workspace role. Create documents and folders: member, owner.
         */
        post: operations["createDocument"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/documents/{documentId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get a document's metadata
         * @description A document the caller cannot read is a `404 not-found`, identical to a missing one. An archived document is readable only by its owners.
         *
         *     Required document role. Read metadata and content: viewer, commenter, editor, owner.
         */
        get: operations["getDocument"];
        put?: never;
        post?: never;
        /**
         * Delete an archived document permanently
         * @description A document that is not archived is a `409 conflict`. Its content, versions, threads and access rows go with it.
         *
         *     Required document role. Archive, restore from archive, delete permanently: owner.
         */
        delete: operations["deleteDocument"];
        options?: never;
        head?: never;
        /**
         * Rename or move a document
         * @description Send the `revision` you last read. A stale one is a `409 revision-conflict` carrying the current document. `folderId: null` moves the document out of its folder.
         *
         *     Required document role. Rename, move to folder: editor, owner.
         */
        patch: operations["updateDocument"];
        trace?: never;
    };
    "/api/documents/{documentId}/archive": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Archive a document
         * @description Idempotent. Connected editors are told the document was archived.
         *
         *     Required document role. Archive, restore from archive, delete permanently: owner.
         */
        post: operations["archiveDocument"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/documents/{documentId}/restore": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Restore a document from the archive
         * @description Idempotent.
         *
         *     Required document role. Archive, restore from archive, delete permanently: owner.
         */
        post: operations["restoreDocument"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/documents/{documentId}/pin": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /**
         * Pin a document for the caller
         * @description Pins are personal. Idempotent.
         *
         *     Required document role. Pin (personal): viewer, commenter, editor, owner.
         */
        put: operations["pinDocument"];
        post?: never;
        /**
         * Unpin a document for the caller
         * @description Idempotent.
         *
         *     Required document role. Pin (personal): viewer, commenter, editor, owner.
         */
        delete: operations["unpinDocument"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/workspaces/{workspaceId}/pinned": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List the caller's pinned documents
         * @description Only documents the caller can still read.
         *
         *     Required workspace role. Read the workspace, its members, folders and lists: member, owner.
         */
        get: operations["listPinnedDocuments"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/workspaces/{workspaceId}/shared": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List the documents shared with the caller
         * @description The documents the caller can read without owning them, by explicit grant or general access. `access` keeps only those where the caller's role is `editor` (`edit`), `commenter` (`comment`) or `viewer` (`view`).
         *
         *     Required workspace role. Read the workspace, its members, folders and lists: member, owner.
         */
        get: operations["listSharedDocuments"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/documents/{documentId}/access": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List who can open a document
         * @description Required document role. Read and change access, general access: owner.
         */
        get: operations["listAccess"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/documents/{documentId}/access/{userId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /**
         * Grant or change a member's role on a document
         * @description The person must belong to the workspace, pending members included. Lowering the last explicit owner is a `409 last-owner`. A role change closes the person's open connection so they reconnect in the new mode.
         *
         *     Required document role. Read and change access, general access: owner.
         */
        put: operations["setAccess"];
        post?: never;
        /**
         * Remove a member's explicit grant
         * @description The person keeps whatever the general access gives them. Their open connection closes. Removing the last explicit owner is a `409 last-owner`.
         *
         *     Required document role. Read and change access, general access: owner.
         */
        delete: operations["removeAccess"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/documents/{documentId}/general-access": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /**
         * Set the general access of a document
         * @description Applies to every workspace member without an explicit grant.
         *
         *     Required document role. Read and change access, general access: owner.
         */
        put: operations["setGeneralAccess"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/documents/{documentId}/threads": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List the comment threads of a document
         * @description Required document role. List and read comments: viewer, commenter, editor, owner.
         */
        get: operations["listThreads"];
        put?: never;
        /**
         * Start a thread on a range of the document
         * @description Required document role. Create thread, reply, resolve, reopen: commenter, editor, owner.
         */
        post: operations["createThread"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/threads/{threadId}/replies": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Reply to a thread
         * @description Required document role. Create thread, reply, resolve, reopen: commenter, editor, owner.
         */
        post: operations["replyToThread"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/threads/{threadId}/resolve": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Resolve a thread
         * @description Idempotent. An orphaned thread can still be resolved.
         *
         *     Required document role. Create thread, reply, resolve, reopen: commenter, editor, owner.
         */
        post: operations["resolveThread"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/threads/{threadId}/reopen": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Reopen a resolved thread
         * @description Idempotent.
         *
         *     Required document role. Create thread, reply, resolve, reopen: commenter, editor, owner.
         */
        post: operations["reopenThread"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/comments/{commentId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /**
         * Delete a comment
         * @description The author can delete their own comment; a document owner can delete anyone's. A thread left without comments is deleted with it.
         *
         *     Required document role. Edit or delete own comment: commenter, editor, owner (author only). Delete another person's comment: owner.
         */
        delete: operations["deleteComment"];
        options?: never;
        head?: never;
        /**
         * Edit a comment
         * @description Only the author. Anyone else who can read the thread gets `403 forbidden`.
         *
         *     Required document role. Edit or delete own comment: commenter, editor, owner (author only).
         */
        patch: operations["updateComment"];
        trace?: never;
    };
    "/api/documents/{documentId}/versions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List the versions of a document
         * @description Ordered by `createdAt` descending, then `id` descending.
         *
         *     Required document role. List and preview versions: viewer, commenter, editor, owner.
         */
        get: operations["listVersions"];
        put?: never;
        /**
         * Save a named version
         * @description Captures the live document as a `manual` version. The body may be omitted.
         *
         *     Required document role. Create a version (manual): editor, owner.
         */
        post: operations["createVersion"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/versions/{versionId}/content": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Download a version's content
         * @description The bytes are a Yjs update. The client loads them into a fresh `Y.Doc` to preview; nothing touches the live document.
         *
         *     Required document role. List and preview versions: viewer, commenter, editor, owner.
         */
        get: operations["getVersionContent"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/versions/{versionId}/restore": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Restore a version
         * @description Saves a `pre-restore` version of the current state, replaces the live content in one transaction and saves a `restore` version. Edits made meanwhile merge on top; none is dropped silently.
         *
         *     Required document role. Restore a version: owner.
         */
        post: operations["restoreVersion"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/workspaces/{workspaceId}/activity": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List the workspace history
         * @description Only events of documents the caller can read at the time of the request. Ordered by `createdAt` descending, then `id` descending.
         *
         *     Required workspace role. Read the workspace, its members, folders and lists: member, owner.
         */
        get: operations["listWorkspaceActivity"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/documents/{documentId}/activity": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List the activity of a document
         * @description Ordered by `createdAt` descending, then `id` descending.
         *
         *     Required document role. Read metadata and content: viewer, commenter, editor, owner.
         */
        get: operations["listDocumentActivity"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/templates": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List the built-in templates
         * @description Names and descriptions come back in the requested language: templates are product content, not user content.
         *
         *     Any signed-in person.
         */
        get: operations["listTemplates"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/health/live": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Check that the process is up
         * @description No sign-in needed.
         */
        get: operations["getLiveness"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/health/ready": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Check that the server can serve requests
         * @description Succeeds when the database is reachable and the migrations are current. Otherwise `503 unavailable`.
         *
         *     No sign-in needed.
         */
        get: operations["getReadiness"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
}
export type webhooks = Record<string, never>;
export interface components {
    schemas: {
        /** Format: uuid */
        Id: string;
        /** Format: uuid */
        NullableId: string | null;
        /** Format: date-time */
        Timestamp: string;
        /** Format: date-time */
        NullableTimestamp: string | null;
        /** Format: email */
        Email: string;
        PersonName: string;
        Password: string;
        WorkspaceName: string;
        FolderName: string;
        DocumentTitle: string;
        CommentBody: string;
        /** @description The selected text the thread was anchored to, kept so an orphaned thread still shows what it was about. */
        Quote: string;
        VersionLabel: string;
        /** @description Starts at 1 and grows by one with every change to the resource's metadata. */
        Revision: number;
        /** @description Opaque. Clients pass back exactly what `nextCursor` returned. */
        Cursor: string;
        /** @description Pass it as `cursor` to read the next page; `null` when this was the last page. */
        NextCursor: string | null;
        /** @enum {string} */
        WorkspaceRole: "owner" | "member";
        /** @enum {string} */
        DocumentRole: "viewer" | "commenter" | "editor" | "owner";
        /**
         * @description The role every workspace member has on a document without an explicit grant.
         * @enum {string}
         */
        GeneralAccess: "none" | "viewer" | "commenter" | "editor";
        /**
         * @description A member added by email is `pending` until that email signs up.
         * @enum {string}
         */
        MemberStatus: "pending" | "active";
        /** @enum {string} */
        ThreadStatus: "open" | "resolved";
        /** @enum {string} */
        VersionKind: "auto" | "manual" | "pre-restore" | "restore";
        /** @enum {string} */
        ActivityType: "document.created" | "document.renamed" | "document.moved" | "document.archived" | "document.restored" | "access.granted" | "access.changed" | "access.revoked" | "general-access.changed" | "thread.created" | "thread.replied" | "thread.resolved" | "thread.reopened" | "version.created" | "version.restored";
        /**
         * @description Stable, machine-readable. Clients map it to a message in the person's language; the server never sends translated text.
         * @enum {string}
         */
        ErrorCode: "validation-failed" | "not-found" | "forbidden" | "unauthenticated" | "csrf" | "revision-conflict" | "last-owner" | "rate-limited" | "too-large" | "conflict" | "internal-error" | "unavailable";
        /** @enum {string} */
        FieldErrorCode: "required" | "too-short" | "too-long" | "invalid-format" | "invalid-value" | "unknown-field";
        /** @description One invalid field of a request. Carries a code, never a message. */
        FieldError: {
            /** @description A JSON Pointer into the request body (`/title`), or `/query/<name>` or `/path/<name>` for parameters. */
            pointer: string;
            code: components["schemas"]["FieldErrorCode"];
        };
        /** @description An RFC 9457 problem. `errors` lists the invalid fields of a `validation-failed` or `too-large` response. */
        Problem: {
            /** Format: uri-reference */
            type: string;
            title: string;
            status: number;
            code: components["schemas"]["ErrorCode"];
            errors?: components["schemas"]["FieldError"][];
        };
        /** @description Returned when `revision` no longer matches: `current` is the document as the server holds it, so the client can reconcile and retry. */
        DocumentRevisionConflict: {
            /** Format: uri-reference */
            type: string;
            title: string;
            /** @constant */
            status: 409;
            /** @constant */
            code: "revision-conflict";
            current: components["schemas"]["Document"];
        };
        /** @description Returned when `revision` no longer matches: `current` is the folder as the server holds it, so the client can reconcile and retry. */
        FolderRevisionConflict: {
            /** Format: uri-reference */
            type: string;
            title: string;
            /** @constant */
            status: 409;
            /** @constant */
            code: "revision-conflict";
            current: components["schemas"]["Folder"];
        };
        User: {
            id: components["schemas"]["Id"];
            email: components["schemas"]["Email"];
            name: components["schemas"]["PersonName"];
        };
        /** @description Enough of a person to label them. */
        UserRef: {
            id: components["schemas"]["Id"];
            name: components["schemas"]["PersonName"];
        };
        /** @description `role` is the caller's role in the workspace. */
        Workspace: {
            id: components["schemas"]["Id"];
            name: components["schemas"]["WorkspaceName"];
            role: components["schemas"]["WorkspaceRole"];
            createdAt: components["schemas"]["Timestamp"];
        };
        /** @description A pending member already has a `userId`: the account created at sign-up keeps it. */
        Member: {
            userId: components["schemas"]["Id"];
            email: components["schemas"]["Email"];
            /** @description `null` while the member is pending. */
            name: string | null;
            role: components["schemas"]["WorkspaceRole"];
            status: components["schemas"]["MemberStatus"];
            createdAt: components["schemas"]["Timestamp"];
        };
        Folder: {
            id: components["schemas"]["Id"];
            workspaceId: components["schemas"]["Id"];
            name: components["schemas"]["FolderName"];
            revision: components["schemas"]["Revision"];
            createdAt: components["schemas"]["Timestamp"];
            updatedAt: components["schemas"]["Timestamp"];
        };
        /** @description Metadata only: the content is a Yjs document that travels over the collaboration connection, never over REST. */
        Document: {
            id: components["schemas"]["Id"];
            workspaceId: components["schemas"]["Id"];
            folderId: components["schemas"]["NullableId"];
            title: components["schemas"]["DocumentTitle"];
            /** @description The start of the first paragraph, or `null` for an empty document. */
            excerpt: string | null;
            revision: components["schemas"]["Revision"];
            /** @description The caller's effective role on this document. */
            role: components["schemas"]["DocumentRole"];
            generalAccess: components["schemas"]["GeneralAccess"];
            /** @description Whether the caller pinned it. */
            pinned: boolean;
            createdBy: components["schemas"]["UserRef"];
            createdAt: components["schemas"]["Timestamp"];
            updatedAt: components["schemas"]["Timestamp"];
            archivedAt: components["schemas"]["NullableTimestamp"];
        };
        DocumentRef: {
            id: components["schemas"]["Id"];
            title: components["schemas"]["DocumentTitle"];
        };
        Template: {
            id: string;
            name: string;
            description: string;
        };
        AccessEntry: {
            userId: components["schemas"]["Id"];
            email: components["schemas"]["Email"];
            name: string | null;
            role: components["schemas"]["DocumentRole"];
            createdAt: components["schemas"]["Timestamp"];
        };
        /** @description The explicit grants and the general access, together, so the sharing panel loads in one request. Workspace owners hold an implicit `owner` role and are not listed. */
        AccessList: {
            items: components["schemas"]["AccessEntry"][];
            generalAccess: components["schemas"]["GeneralAccess"];
        };
        GeneralAccessSetting: {
            generalAccess: components["schemas"]["GeneralAccess"];
        };
        /** @description The server stores both ends as given and never decodes them. */
        Anchor: {
            /** @description Base64 `Y.encodeRelativePosition` with `assoc = 0`. */
            start: string;
            /** @description Base64 `Y.encodeRelativePosition` with `assoc = -1`. */
            end: string;
        };
        Comment: {
            id: components["schemas"]["Id"];
            threadId: components["schemas"]["Id"];
            author: components["schemas"]["UserRef"];
            body: components["schemas"]["CommentBody"];
            createdAt: components["schemas"]["Timestamp"];
            updatedAt: components["schemas"]["Timestamp"];
        };
        /** @description Whether a thread is orphaned is decided by the client when it resolves the anchor; the server has no such state. */
        Thread: {
            id: components["schemas"]["Id"];
            documentId: components["schemas"]["Id"];
            status: components["schemas"]["ThreadStatus"];
            anchor: components["schemas"]["Anchor"];
            quote: components["schemas"]["Quote"];
            createdBy: components["schemas"]["UserRef"];
            createdAt: components["schemas"]["Timestamp"];
            resolvedAt: components["schemas"]["NullableTimestamp"];
            resolvedBy: components["schemas"]["UserRef"] | null;
            /** @description Oldest first. */
            comments: components["schemas"]["Comment"][];
        };
        /** @description `createdBy` is `null` for versions the server created on its own. */
        Version: {
            id: components["schemas"]["Id"];
            documentId: components["schemas"]["Id"];
            kind: components["schemas"]["VersionKind"];
            label: string | null;
            createdBy: components["schemas"]["UserRef"] | null;
            createdAt: components["schemas"]["Timestamp"];
            sizeBytes: number;
        };
        ActivityEvent: {
            id: components["schemas"]["Id"];
            type: components["schemas"]["ActivityType"];
            createdAt: components["schemas"]["Timestamp"];
            actor: components["schemas"]["UserRef"] | null;
            document: components["schemas"]["DocumentRef"];
            /** @description The person an access change is about. */
            targetUser: components["schemas"]["UserRef"] | null;
        };
        LiveStatus: {
            /** @enum {string} */
            status: "ok";
        };
        ReadyStatus: {
            /** @enum {string} */
            status: "ok";
            /** @enum {string} */
            database: "up";
            /** @enum {string} */
            migrations: "current";
        };
        SignUpRequest: {
            email: components["schemas"]["Email"];
            password: components["schemas"]["Password"];
            name: components["schemas"]["PersonName"];
        };
        SignInRequest: {
            email: components["schemas"]["Email"];
            password: string;
        };
        UpdateWorkspaceRequest: {
            name: components["schemas"]["WorkspaceName"];
        };
        AddMemberRequest: {
            email: components["schemas"]["Email"];
            role: components["schemas"]["WorkspaceRole"];
        };
        UpdateMemberRequest: {
            role: components["schemas"]["WorkspaceRole"];
        };
        CreateFolderRequest: {
            name: components["schemas"]["FolderName"];
        };
        UpdateFolderRequest: {
            name: components["schemas"]["FolderName"];
            revision: components["schemas"]["Revision"];
        };
        CreateDocumentRequest: {
            title: components["schemas"]["DocumentTitle"];
            folderId?: components["schemas"]["NullableId"];
            templateId?: string;
        };
        UpdateDocumentRequest: {
            title?: components["schemas"]["DocumentTitle"];
            folderId?: components["schemas"]["NullableId"];
            revision: components["schemas"]["Revision"];
        };
        SetAccessRequest: {
            role: components["schemas"]["DocumentRole"];
        };
        CreateThreadRequest: {
            anchor: components["schemas"]["Anchor"];
            quote: components["schemas"]["Quote"];
            body: components["schemas"]["CommentBody"];
        };
        CreateCommentRequest: {
            body: components["schemas"]["CommentBody"];
        };
        UpdateCommentRequest: {
            body: components["schemas"]["CommentBody"];
        };
        CreateVersionRequest: {
            label?: components["schemas"]["VersionLabel"];
        };
        WorkspaceList: {
            items: components["schemas"]["Workspace"][];
        };
        MemberList: {
            items: components["schemas"]["Member"][];
        };
        FolderList: {
            items: components["schemas"]["Folder"][];
        };
        DocumentList: {
            items: components["schemas"]["Document"][];
        };
        ThreadList: {
            items: components["schemas"]["Thread"][];
        };
        TemplateList: {
            items: components["schemas"]["Template"][];
        };
        DocumentPage: {
            items: components["schemas"]["Document"][];
            nextCursor: components["schemas"]["NextCursor"];
        };
        VersionPage: {
            items: components["schemas"]["Version"][];
            nextCursor: components["schemas"]["NextCursor"];
        };
        ActivityPage: {
            items: components["schemas"]["ActivityEvent"][];
            nextCursor: components["schemas"]["NextCursor"];
        };
    };
    responses: {
        /** @description The request is malformed or breaks a rule of the contract. `errors` says which fields. */
        BadRequest: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/problem+json": components["schemas"]["Problem"];
            };
        };
        /** @description There is no valid session, or the credentials are wrong. */
        Unauthenticated: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/problem+json": components["schemas"]["Problem"];
            };
        };
        /** @description The caller can see the resource but may not do this (`forbidden`), or the `X-CSRF-Token` header is missing or wrong (`csrf`). */
        Forbidden: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/problem+json": components["schemas"]["Problem"];
            };
        };
        /** @description There is no such resource, or the caller cannot read it. The two are indistinguishable on purpose. */
        NotFound: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/problem+json": components["schemas"]["Problem"];
            };
        };
        /** @description The request conflicts with the current state of the resource. */
        Conflict: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/problem+json": components["schemas"]["Problem"];
            };
        };
        /** @description A workspace or a document always keeps at least one owner. */
        LastOwner: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/problem+json": components["schemas"]["Problem"];
            };
        };
        /** @description The `revision` sent is stale. */
        DocumentStale: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/problem+json": components["schemas"]["DocumentRevisionConflict"];
            };
        };
        /** @description The `revision` sent is stale. */
        FolderStale: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/problem+json": components["schemas"]["FolderRevisionConflict"];
            };
        };
        /** @description A text in the request body is longer than its limit, or the body is bigger than the server accepts. A value below its minimum, and any query or path parameter out of range, is a `400 validation-failed` instead. */
        TooLarge: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/problem+json": components["schemas"]["Problem"];
            };
        };
        /** @description Too many attempts. Retry after the delay in `Retry-After`. */
        RateLimited: {
            headers: {
                /** @description Seconds to wait. */
                "Retry-After"?: number;
                [name: string]: unknown;
            };
            content: {
                "application/problem+json": components["schemas"]["Problem"];
            };
        };
        /** @description The database is unreachable or the migrations are not current. */
        Unavailable: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/problem+json": components["schemas"]["Problem"];
            };
        };
        /** @description Any other failure. Unhandled errors are `internal-error`. */
        Unexpected: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/problem+json": components["schemas"]["Problem"];
            };
        };
    };
    parameters: {
        WorkspaceId: components["schemas"]["Id"];
        FolderId: components["schemas"]["Id"];
        DocumentId: components["schemas"]["Id"];
        ThreadId: components["schemas"]["Id"];
        CommentId: components["schemas"]["Id"];
        VersionId: components["schemas"]["Id"];
        UserId: components["schemas"]["Id"];
        /** @description Where the previous page ended. */
        Cursor: components["schemas"]["Cursor"];
        /** @description The most items to return. */
        Limit: number;
    };
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export interface operations {
    getMe: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The person behind the session. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["User"];
                };
            };
            401: components["responses"]["Unauthenticated"];
            default: components["responses"]["Unexpected"];
        };
    };
    signUp: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["SignUpRequest"];
            };
        };
        responses: {
            /** @description The account was created and the session started. */
            201: {
                headers: {
                    /** @description Sets `dr_session` (HttpOnly) and `dr_csrf` (readable by the client, echoed in `X-CSRF-Token`). */
                    "Set-Cookie"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["User"];
                };
            };
            400: components["responses"]["BadRequest"];
            409: components["responses"]["Conflict"];
            413: components["responses"]["TooLarge"];
            429: components["responses"]["RateLimited"];
            default: components["responses"]["Unexpected"];
        };
    };
    signIn: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["SignInRequest"];
            };
        };
        responses: {
            /** @description The session started. */
            200: {
                headers: {
                    /** @description Sets `dr_session` (HttpOnly) and `dr_csrf` (readable by the client, echoed in `X-CSRF-Token`). */
                    "Set-Cookie"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["User"];
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthenticated"];
            413: components["responses"]["TooLarge"];
            429: components["responses"]["RateLimited"];
            default: components["responses"]["Unexpected"];
        };
    };
    signOut: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The session ended. */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            401: components["responses"]["Unauthenticated"];
            403: components["responses"]["Forbidden"];
            default: components["responses"]["Unexpected"];
        };
    };
    listWorkspaces: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The workspaces the caller belongs to. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["WorkspaceList"];
                };
            };
            401: components["responses"]["Unauthenticated"];
            default: components["responses"]["Unexpected"];
        };
    };
    getWorkspace: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                workspaceId: components["parameters"]["WorkspaceId"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The workspace. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Workspace"];
                };
            };
            401: components["responses"]["Unauthenticated"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
            default: components["responses"]["Unexpected"];
        };
    };
    updateWorkspace: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                workspaceId: components["parameters"]["WorkspaceId"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["UpdateWorkspaceRequest"];
            };
        };
        responses: {
            /** @description The renamed workspace. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Workspace"];
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthenticated"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
            413: components["responses"]["TooLarge"];
            default: components["responses"]["Unexpected"];
        };
    };
    listMembers: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                workspaceId: components["parameters"]["WorkspaceId"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The members. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MemberList"];
                };
            };
            401: components["responses"]["Unauthenticated"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
            default: components["responses"]["Unexpected"];
        };
    };
    addMember: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                workspaceId: components["parameters"]["WorkspaceId"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["AddMemberRequest"];
            };
        };
        responses: {
            /** @description The new member. */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Member"];
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthenticated"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
            409: components["responses"]["Conflict"];
            413: components["responses"]["TooLarge"];
            default: components["responses"]["Unexpected"];
        };
    };
    removeMember: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                workspaceId: components["parameters"]["WorkspaceId"];
                userId: components["parameters"]["UserId"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The member was removed. */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            401: components["responses"]["Unauthenticated"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
            409: components["responses"]["LastOwner"];
            default: components["responses"]["Unexpected"];
        };
    };
    updateMember: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                workspaceId: components["parameters"]["WorkspaceId"];
                userId: components["parameters"]["UserId"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["UpdateMemberRequest"];
            };
        };
        responses: {
            /** @description The member with the new role. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Member"];
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthenticated"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
            409: components["responses"]["LastOwner"];
            default: components["responses"]["Unexpected"];
        };
    };
    listFolders: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                workspaceId: components["parameters"]["WorkspaceId"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The folders, by name. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["FolderList"];
                };
            };
            401: components["responses"]["Unauthenticated"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
            default: components["responses"]["Unexpected"];
        };
    };
    createFolder: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                workspaceId: components["parameters"]["WorkspaceId"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CreateFolderRequest"];
            };
        };
        responses: {
            /** @description The new folder. */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Folder"];
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthenticated"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
            413: components["responses"]["TooLarge"];
            default: components["responses"]["Unexpected"];
        };
    };
    deleteFolder: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                folderId: components["parameters"]["FolderId"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The folder was deleted. */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            401: components["responses"]["Unauthenticated"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
            409: components["responses"]["Conflict"];
            default: components["responses"]["Unexpected"];
        };
    };
    updateFolder: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                folderId: components["parameters"]["FolderId"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["UpdateFolderRequest"];
            };
        };
        responses: {
            /** @description The renamed folder. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Folder"];
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthenticated"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
            409: components["responses"]["FolderStale"];
            413: components["responses"]["TooLarge"];
            default: components["responses"]["Unexpected"];
        };
    };
    listDocuments: {
        parameters: {
            query?: {
                /** @description Where the previous page ended. */
                cursor?: components["parameters"]["Cursor"];
                /** @description The most items to return. */
                limit?: components["parameters"]["Limit"];
                /**
                 * @description Matches the title and the excerpt.
                 * @example launch
                 */
                query?: string;
                /** @description Only the documents of this folder. */
                folderId?: components["schemas"]["Id"];
                /** @description List archived documents instead of live ones. */
                archived?: boolean;
            };
            header?: never;
            path: {
                workspaceId: components["parameters"]["WorkspaceId"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description A page of documents. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DocumentPage"];
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthenticated"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
            default: components["responses"]["Unexpected"];
        };
    };
    createDocument: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                workspaceId: components["parameters"]["WorkspaceId"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CreateDocumentRequest"];
            };
        };
        responses: {
            /** @description The new document. */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Document"];
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthenticated"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
            413: components["responses"]["TooLarge"];
            default: components["responses"]["Unexpected"];
        };
    };
    getDocument: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                documentId: components["parameters"]["DocumentId"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The document. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Document"];
                };
            };
            401: components["responses"]["Unauthenticated"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
            default: components["responses"]["Unexpected"];
        };
    };
    deleteDocument: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                documentId: components["parameters"]["DocumentId"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The document was deleted. */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            401: components["responses"]["Unauthenticated"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
            409: components["responses"]["Conflict"];
            default: components["responses"]["Unexpected"];
        };
    };
    updateDocument: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                documentId: components["parameters"]["DocumentId"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["UpdateDocumentRequest"];
            };
        };
        responses: {
            /** @description The updated document. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Document"];
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthenticated"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
            409: components["responses"]["DocumentStale"];
            413: components["responses"]["TooLarge"];
            default: components["responses"]["Unexpected"];
        };
    };
    archiveDocument: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                documentId: components["parameters"]["DocumentId"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The archived document. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Document"];
                };
            };
            401: components["responses"]["Unauthenticated"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
            default: components["responses"]["Unexpected"];
        };
    };
    restoreDocument: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                documentId: components["parameters"]["DocumentId"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The restored document. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Document"];
                };
            };
            401: components["responses"]["Unauthenticated"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
            default: components["responses"]["Unexpected"];
        };
    };
    pinDocument: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                documentId: components["parameters"]["DocumentId"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The document is pinned. */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            401: components["responses"]["Unauthenticated"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
            default: components["responses"]["Unexpected"];
        };
    };
    unpinDocument: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                documentId: components["parameters"]["DocumentId"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The document is not pinned. */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            401: components["responses"]["Unauthenticated"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
            default: components["responses"]["Unexpected"];
        };
    };
    listPinnedDocuments: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                workspaceId: components["parameters"]["WorkspaceId"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The pinned documents, most recently updated first. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DocumentList"];
                };
            };
            401: components["responses"]["Unauthenticated"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
            default: components["responses"]["Unexpected"];
        };
    };
    listSharedDocuments: {
        parameters: {
            query?: {
                /** @description Filter by the caller's role. */
                access?: "edit" | "comment" | "view";
            };
            header?: never;
            path: {
                workspaceId: components["parameters"]["WorkspaceId"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The shared documents, most recently updated first. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DocumentList"];
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthenticated"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
            default: components["responses"]["Unexpected"];
        };
    };
    listAccess: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                documentId: components["parameters"]["DocumentId"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The explicit grants and the general access. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AccessList"];
                };
            };
            401: components["responses"]["Unauthenticated"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
            default: components["responses"]["Unexpected"];
        };
    };
    setAccess: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                documentId: components["parameters"]["DocumentId"];
                userId: components["parameters"]["UserId"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["SetAccessRequest"];
            };
        };
        responses: {
            /** @description The grant. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AccessEntry"];
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthenticated"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
            409: components["responses"]["LastOwner"];
            default: components["responses"]["Unexpected"];
        };
    };
    removeAccess: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                documentId: components["parameters"]["DocumentId"];
                userId: components["parameters"]["UserId"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The grant was removed. */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            401: components["responses"]["Unauthenticated"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
            409: components["responses"]["LastOwner"];
            default: components["responses"]["Unexpected"];
        };
    };
    setGeneralAccess: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                documentId: components["parameters"]["DocumentId"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["GeneralAccessSetting"];
            };
        };
        responses: {
            /** @description The new setting. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["GeneralAccessSetting"];
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthenticated"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
            default: components["responses"]["Unexpected"];
        };
    };
    listThreads: {
        parameters: {
            query?: {
                /** @description Only threads with this status; both when omitted. */
                status?: components["schemas"]["ThreadStatus"];
            };
            header?: never;
            path: {
                documentId: components["parameters"]["DocumentId"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The threads with their comments, oldest first. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ThreadList"];
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthenticated"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
            default: components["responses"]["Unexpected"];
        };
    };
    createThread: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                documentId: components["parameters"]["DocumentId"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CreateThreadRequest"];
            };
        };
        responses: {
            /** @description The new thread with its first comment. */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Thread"];
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthenticated"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
            413: components["responses"]["TooLarge"];
            default: components["responses"]["Unexpected"];
        };
    };
    replyToThread: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                threadId: components["parameters"]["ThreadId"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CreateCommentRequest"];
            };
        };
        responses: {
            /** @description The new comment. */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Comment"];
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthenticated"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
            413: components["responses"]["TooLarge"];
            default: components["responses"]["Unexpected"];
        };
    };
    resolveThread: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                threadId: components["parameters"]["ThreadId"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The resolved thread. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Thread"];
                };
            };
            401: components["responses"]["Unauthenticated"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
            default: components["responses"]["Unexpected"];
        };
    };
    reopenThread: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                threadId: components["parameters"]["ThreadId"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The reopened thread. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Thread"];
                };
            };
            401: components["responses"]["Unauthenticated"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
            default: components["responses"]["Unexpected"];
        };
    };
    deleteComment: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                commentId: components["parameters"]["CommentId"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The comment was deleted. */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            401: components["responses"]["Unauthenticated"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
            default: components["responses"]["Unexpected"];
        };
    };
    updateComment: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                commentId: components["parameters"]["CommentId"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["UpdateCommentRequest"];
            };
        };
        responses: {
            /** @description The edited comment. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Comment"];
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthenticated"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
            413: components["responses"]["TooLarge"];
            default: components["responses"]["Unexpected"];
        };
    };
    listVersions: {
        parameters: {
            query?: {
                /** @description Where the previous page ended. */
                cursor?: components["parameters"]["Cursor"];
                /** @description The most items to return. */
                limit?: components["parameters"]["Limit"];
            };
            header?: never;
            path: {
                documentId: components["parameters"]["DocumentId"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description A page of versions. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["VersionPage"];
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthenticated"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
            default: components["responses"]["Unexpected"];
        };
    };
    createVersion: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                documentId: components["parameters"]["DocumentId"];
            };
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": components["schemas"]["CreateVersionRequest"];
            };
        };
        responses: {
            /** @description The new version. */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Version"];
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthenticated"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
            413: components["responses"]["TooLarge"];
            default: components["responses"]["Unexpected"];
        };
    };
    getVersionContent: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                versionId: components["parameters"]["VersionId"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The version's Yjs update. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/octet-stream": string;
                };
            };
            401: components["responses"]["Unauthenticated"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
            default: components["responses"]["Unexpected"];
        };
    };
    restoreVersion: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                versionId: components["parameters"]["VersionId"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The `restore` version the operation created. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Version"];
                };
            };
            401: components["responses"]["Unauthenticated"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
            default: components["responses"]["Unexpected"];
        };
    };
    listWorkspaceActivity: {
        parameters: {
            query?: {
                /** @description Where the previous page ended. */
                cursor?: components["parameters"]["Cursor"];
                /** @description The most items to return. */
                limit?: components["parameters"]["Limit"];
                /** @description Only events of this document. */
                documentId?: components["schemas"]["Id"];
                /** @description Only events by this person. */
                actorId?: components["schemas"]["Id"];
                /** @description Only events at or after this instant. */
                from?: components["schemas"]["Timestamp"];
                /** @description Only events before this instant. */
                to?: components["schemas"]["Timestamp"];
            };
            header?: never;
            path: {
                workspaceId: components["parameters"]["WorkspaceId"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description A page of events. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ActivityPage"];
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthenticated"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
            default: components["responses"]["Unexpected"];
        };
    };
    listDocumentActivity: {
        parameters: {
            query?: {
                /** @description Where the previous page ended. */
                cursor?: components["parameters"]["Cursor"];
                /** @description The most items to return. */
                limit?: components["parameters"]["Limit"];
            };
            header?: never;
            path: {
                documentId: components["parameters"]["DocumentId"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description A page of events. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ActivityPage"];
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthenticated"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
            default: components["responses"]["Unexpected"];
        };
    };
    listTemplates: {
        parameters: {
            query?: {
                /** @description The language of the template names and descriptions. */
                locale?: "en" | "es";
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The templates. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TemplateList"];
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthenticated"];
            default: components["responses"]["Unexpected"];
        };
    };
    getLiveness: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The process answers. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["LiveStatus"];
                };
            };
            default: components["responses"]["Unexpected"];
        };
    };
    getReadiness: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The server is ready. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ReadyStatus"];
                };
            };
            503: components["responses"]["Unavailable"];
            default: components["responses"]["Unexpected"];
        };
    };
}
