# Specifications

## User Authentication

There are two types of authentication:

-   Credential-based: simple login/password with 2FA (sending a code per email to verify the user's identity)

    -   The users that authenticate using credentials are managed by the systems internal user Database, they are called "Internal Users"

    -   Passwords are encrypted

-   SSO: the user's credential are controlled by a 3^rd^ party authority using oAuth. These users are called "AD Users"

## User Authorization

User authorizations are assigned by roles. A user can have one or many roles. Each role provides access to a set of features of the system (both front-end and back-end).

### Roles

There are three basic roles:

-   Admin: the users with the Admin role can manage users

-   Power-user: the users with the "Power-user" role have access to some specific features of the system (agent creation, tools creation, etc.)

-   User: the users with the "User" role have access to the chatbot and a limited set of features (preferences, agent log, etc.)

In all functions that manage users throughout the system, a user MUST always have at least one role.

### Configuring Roles

In the "Settings" Menu (located at the bottom left of the application's screen), a new tab is created. This tab can be accessed by and is visible only to Admins. This is where Roles Management is handled by Admins.

An Admin can create a new role. They specify:

-   The role name

-   A short description

-   The features to which the role has access

An Admin can update a role by selecting other features or deselecting features the role has access to.

The "User" role cannot be deleted. An Admin can delete a role, except of course the "User" role.

When an Admin deletes a role, all users this role is revoked for all users that have it.

-   If a user has only the deleted role, then he gets the "User" role assigned in place of the revoked role.

-   If a Role is deleted, any AD Group Mappings targeting that Role must be automatically updated to the default \'User\' role.

### Group Mapping

#### AD Group Discovery (Lazy Loading) 

To avoid manual errors in group naming, the system automatically builds a catalog of \"Known AD Groups\" based on user activity.

-   **Discovery Mechanism:** Every time an AD User successfully logs in via SSO, the system inspects the groups claim in their security token.

-   **Cataloging:** Any AD Group identifier (Name or Object ID) found in the user\'s token that is not already present in the system\'s \"Known AD Groups\" list is automatically added to the list.

-   **Data Stored:** The system stores only the Group Identifier (and Group Name if available in the token) to facilitate mapping. No other group metadata is required.

#### Roles assignment to groups

For AD users, the Admin can assign a default set of roles for groups.

The "Settings menu" provides a dedicated tab for group mapping, accessible only to Admins.

From there, the Admin is presented with a **searchable dropdown list** (Autocomplete) populated by the \"Known AD Groups\" catalog.

If an Admin wishes to map a group that has not yet been \"discovered\" (because no user from that group has logged in yet), the interface allows them to manually type the AD Group String and save it. These are visually marked as \"Manually Added\".

Once a group is selected or entered, the Admin assigns a default set of roles that members of this group will inherit.

The Admin can also view the list of AD groups to which roles have been assigned and modify the list of roles of an AD Group (Add a new Role, Revoke a Role).

Users of an AD Group will inherit any change to the roles assignments of this AD Group.

-   Note: Synchronization of AD Groups and Roles occurs only when the user logs in (token issuance). If critical permissions are revoked in AD, the user will retain them in the system until their current session expires and they are forced to re-authenticate.

Roles assigned to users through AD group mapping are read-only in the User Management UI.

## User Interface

In the "Settings" Menu (located at the bottom left of the application's screen), a new tab is created. This tab can be accessed by and is visible only to Admins. This is where User Management is handled by Admins.

### Creating users

#### Internal Users

Internal Users can be created in two ways:

-   Request from the user:

    -   Upon first access to the system, a user is presented with the option to create an account.

    -   Creating an account requests the user to enter his first name, last name, email address, a login, a password (twice for control).

    -   Once the user has validated this information, the system sends an email with a link to the email address provided to validate the email.

    -   Once the user has validated his email address by clicking on the link he is registered. He receives another email informing him that an admin will review his credentials and validate his request.

    -   All admin users receive an email with the information related to the requesting user along with a link to approve this user.

    -   This link leads to a page requesting the Admin to approve or refuse the user and, if he selected "Approve" to assign a set of roles to the user.

    -   The decision of the admin is sent per email to the user (including notification of his roles if his request is approved).

    -   If the user is approved he can access the system.

-   Creation by the Admin:

    -   The admin has the ability to create a new Internal User through the User Management Interface.

    -   When he creates a new Internal User, he has to enter the first name, last name, email, login, initial password of the user, the roles of the user.

    -   When he validates the user is immediately approved.

    -   When the user has been created by the admin he receives an email with confirmation of his access and his roles.

#### AD Users

As their name implies, AD users are Active Directory users.

AD Users are not "created" per se as they already exist in the AD directory.

When an AD user first accesses the system, his reference record is automatically created into the internal User database of the system.

If this AD user is part of AD Groups for which roles have been mapped, he inherits automatically the roles mapped to these groups.

If this AD user is not part of any AD group for which roles have been mapped, the user is created but assigned **No Role** (or a \'Pending\' status). They cannot access the systems features until an Admin manually assigns a role or maps their group.

The internal User DB of the system will simply record a reference to the AD record corresponding to the selected user, along with its roles.

This user will be authenticated using SSO/oAuth.

### Updating User Information

#### Internal Users

When an Internal User accesses the system he has to log-in. From the login popup he can request to change his password:

-   He will receive a link to a form where he can update his password (double entry for confirmation)

When an Internal User is logged-in, he can access the configuration of his account through the "Settings menu". There is a dedicated tab for this where the user can:

-   Change his email address

-   Change his password (double entry for confirmation)

For an Admin, the "User Management" Admin User Interface provides the following features:

-   Display the list of Internal Users. This list displays: First name, Last Name, email address, Active / Inactive. This list can be filtered by any column. The Admin can select an option to show only active users or only inactive users

```{=html}
<!-- -->
```
-   Select an Internal User for update. Then the Admin can update the First Name, The last Name, The email address and the roles assigned to this user

#### AD Users

There is a dedicated UI for the admin (as part of the User Management UI) for AD Users where the Admin can:

-   View the list of AD users registered into the System

-   This list displays all AD user information (First name, Last Name, Organization, email address, Active / Inactive, Roles).

-   This list can be filtered by any column. The Admin can select an option to show only active users or only inactive users or users that have "No role".

-   Select a user and change the roles assigned to this user. BEWARE: roles mapped through Group Mapping are read-only and the Admin cannot change them for a given user. However, the Admin can assign or revoke additional roles for a specific user.

#### Deleting a user

Users are NEVER deleted from the system, but only marked as "Inactive".

#### Internal Users

For an Admin, the "User Management" Admin User Interface provides the ability to "Inactivate" an Internal User. This is done by selecting the user into the user list and toggling the "Activation" of the user.

Similarly, the Admin can "re-activate" an Internal User.

#### AD Users

For an Admin, the "User Management" Admin User Interface provides the ability to "Inactivate" an AD User. This is done by selecting the user into the user list and toggling the "Activation" of the user.

Similarly, the Admin can "re-activate" an AD User.

If a user is disabled in AD, Microsoft/AD will refuse to issue the OAuth token, and he cannot log in to the system.

If an AD User logs in and an Internal User with the same email already exists, the system updates the authentication method of the existing record to \'SSO\' and retains the history/roles.

## Configuration of oAuth

The "Settings Menu" allows the Admin to configure oAuth.

A dedicated tab is available only to the Admin. The tab displays the **Redirect URI** (Read-Only) that the Admin must copy to their Identity Provider configuration. The Admin must enter the Client ID, Client Secret, and Tenant URL provided by the Identity Provider.

# Developer Implementation Summary: User Management & SSO

## 1. Authentication Logic

-   **Dual Auth System:** The Users table must support two modes:

    1.  **Internal:** Authenticated via password_hash (Bcrypt/Argon2) stored locally^6^.

    2.  **External (SSO):** Authenticated via OAuth/OIDC token. **No password** is stored locally^7777^.

-   **Account Merging (Critical):** On SSO login, if the email matches an existing *Internal* user, automatically update the user record to type = SSO, clear the password, and retain existing ID/Roles^8^.

-   **Inactivation:** Check is_active status **before** issuing a session.

    -   *Internal:* Checked against DB.

    -   *AD:* Implicitly checked via Identity Provider (IdP); if IdP refuses token, login fails. Explicitly check local DB is_active flag as well^9^.

## 2. JIT Provisioning & Group Discovery (The Login Flow)

**Trigger:** Occurs strictly upon successful Token Issuance (Login)^10^.

1.  **Parse Token:** Extract User Claims (email, name, oid) and Group Claims (groups).

2.  **Lazy Group Discovery:**

    -   Loop through all Group IDs in the token.

    -   **UPSERT** into table Known_AD_Groups (Columns: group_id, group_name).

    -   *Result:* This populates the Admin\'s dropdown list automatically ^11^.

3.  **User Provisioning:**

    -   If User does not exist: **INSERT** new record^12^.

    -   If User exists: **UPDATE** metadata (optional, to keep names fresh).

4.  **Role Synchronization:**

    -   Fetch all GroupMappings where ad_group_id matches the user\'s token groups.

    -   Calculate **Mapped Roles**.

    -   If Mapped Roles is EMPTY and Manual Roles is EMPTY \$\\rightarrow\$ Assign **\'No Role\' (Pending)** status^13^.

    -   If Mapped Roles exist \$\\rightarrow\$ User inherits these automatically^14^.

## 3. Role & Permission Management

-   **Hybrid Model:**

    -   Effective_Roles = (Mapped_Group_Roles) U (Manually_Assigned_Roles).

    -   **UI Constraint:** Mapped roles are **Read-Only** in the User Detail view^15^. Manual roles can be toggled by Admins^16^.

-   **Role Deletion Cascade:**

    -   If a Role is deleted \$\\rightarrow\$ Delete from User_Roles (junction table).

    -   **CRITICAL:** Also update/delete from Group_Mappings. If a mapping targets a deleted role, update it to the default \'User\' role or remove the mapping entirely^17^.

    -   *Fallback:* If a user loses all roles due to deletion, default to \'User\' role^18^.

## 4. Admin UI Requirements

-   **Group Mapping Tab:**

    -   **Input:** Searchable Dropdown (Autocomplete) backed by Known_AD_Groups table^19^.

    -   **Fallback:** Allow manual string entry for groups not yet discovered^20^.

-   **User Management:**

    -   **Filter:** Must filter by Active/Inactive/No-Role^21^.

    -   **Create Internal:** Two flows (Self-signup w/ Approval OR Admin-create)^22^.

    -   **Create AD:** **DISABLE** manual creation. Users are created via JIT only^23^.

## 5. Database Schema Hints

-   Users: id, email (unique), auth_type (Internal/SSO), password_hash (nullable), is_active.

-   Roles: id, name, permissions (JSON/Relation).

-   Known_AD_Groups: id, ad_group_oid (unique), display_name.

-   Group_Mappings: ad_group_id, role_id.

-   User_Roles: user_id, role_id, source (ENUM: \'MANUAL\', \'MAPPED\').

# User Acceptance Testing (UAT) Scenarios

## Internal User Management

  ID       Scenario               Action                                                                      Expected Result                                                               Source
  -------- ---------------------- --------------------------------------------------------------------------- ----------------------------------------------------------------------------- --------
  UAT-01   **Self-Signup Flow**   User fills signup form and clicks \"Validate\".                             User receives validation email. Account is created but **not** yet active.    ^1^
  UAT-02   **Admin Approval**     User validates email. Admin receives notification and clicks \"Approve\".   User receives approval email. User can now log in.                            ^2^
  UAT-03   **Admin Creation**     Admin manually creates a user via \"User Management\" UI.                   User is created immediately (Active). User receives email with credentials.   ^3^
  UAT-04   **Inactivation**       Admin toggles \"Active\" to \"Inactive\" for an Internal User.              User cannot log in. User remains in list (filtered view).                     ^4^

## 2. AD User & JIT Provisioning

  ID       Scenario                     Action                                                                                        Expected Result                                                                                     Source
  -------- ---------------------------- --------------------------------------------------------------------------------------------- --------------------------------------------------------------------------------------------------- --------
  UAT-05   **New AD User (Unmapped)**   A new AD user (part of unmapped groups) logs in for the 1st time.                             Account is created in DB^5^. **Status is Pending / No Role**^6^. Access to features is denied^7^.   
  UAT-06   **Lazy Group Discovery**     The user from UAT-05 logs in. Admin checks \"Group Mapping\" settings.                        The user\'s AD groups appear in the \"Known AD Groups\" dropdown list automatically.                ^8^
  UAT-07   **Group Mapping Sync**       Admin maps \"Finance Group\" to \"User Role\". User from UAT-05 (in Finance) logs in again.   User is automatically assigned the \"User Role\" upon token issuance.                               ^9999^
  UAT-08   **Account Merging**          Existing Internal User bob\@test.com exists. Admin enables SSO. Bob logs in via Microsoft.    System detects email match. Account updates to Auth Type: SSO. History/Roles are preserved.         

## 3. Role Management & Hierarchy

  ID       Scenario                      Action                                                                                             Expected Result                                                                                     Source
  -------- ----------------------------- -------------------------------------------------------------------------------------------------- --------------------------------------------------------------------------------------------------- --------
  UAT-09   **Hybrid Roles**              Admin views AD User from UAT-07. Admin tries to remove \"User Role\". Admin adds \"Admin Role\".   \"User Role\" is **Read-Only** (cannot be removed)^11^. \"Admin Role\" is successfully added^12^.   
  UAT-10   **Role Deletion (User)**      Admin deletes the \"Editor\" role. A user had *only* this role.                                    User is automatically reassigned to the \"User\" role.                                              ^13^
  UAT-11   **Role Deletion (Mapping)**   Admin deletes the \"Editor\" role. \"Marketing Group\" was mapped to \"Editor\".                   The mapping for \"Marketing Group\" is automatically updated to \'User\' (or removed).              

## 4. Admin UI & Configuration

  ID       Scenario                 Action                                                                                 Expected Result                                                                                           Source
  -------- ------------------------ -------------------------------------------------------------------------------------- --------------------------------------------------------------------------------------------------------- --------
  UAT-12   **OAuth Config**         Admin navigates to OAuth Settings tab.                                                 Redirect URI is visible but **Read-Only**. Client ID/Secret are editable.                                 ^15^
  UAT-13   **Manual Group Entry**   Admin types \"New_Group_X\" into Group Mapping (group not yet discovered).             System accepts the manual entry. Group is marked as \"Manually Added\".                                   ^16^
  UAT-14   **Inactivate AD User**   Admin toggles AD User to \"Inactive\" in your app. User is still active in Azure AD.   User logs in via SSO (Microsoft says OK), but your App rejects the login immediately after token check.   
