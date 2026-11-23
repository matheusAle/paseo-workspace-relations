Adds a "Relations" sidebar view: Paseo's workspace sidebar with each workspace's spawned
workspaces nested beneath it, plus richer pull request status. It also adds review details to
the default sidebar's rows.

## Relations sidebar view

Enable it from Settings > Sidebar > Sidebar view. It follows the default sidebar: workspaces grouped
by project (or by status), the same status indicators, timestamps, pull request, checks and service
details, "Show more" past seven workspaces, a Pinned section, a hover card with copyable branch and
path, a "+" on each project to start a new workspace there, and per-workspace actions (copy path or
branch, rename, pin, labels, archive) from the row's ⋮ button or a right-click. The display
preferences menu offers the same grouping, sort, title, show, host, project and label options, and
they are saved on this device.

Drag to reorder, as in the default sidebar: projects and pinned workspaces always, and the
workspaces in a project when Sort is Manual. With the mouse a drag starts once the pointer moves;
on touch, hold the row first. The order is kept on this device. On web it starts from the order the
default sidebar already has, copied once from the app's storage the first time the view loads.

A workspace created by another workspace's agent appears indented under that workspace, as deep as
the chain goes. Hover the parent and use its chevron to collapse them. Under Manual sort, sub-agent
workspaces reorder among their siblings, and dragging a parent moves its sub-agent workspaces with it.

Where it differs from the default sidebar: project icons show as letter avatars, the workspace menu
has no Mark as read/unread or Open in file manager, and the project menu only has Open project
settings (web) and Copy path. Reordering here doesn't change the default sidebar's order.

## Pull request details

Rows show a draft pull request as a draft, how many approvals it has (for example "1/2" when the
repository requires reviews), and merge conflicts. The hover card also says whether it can merge.
The default sidebar gets the same draft, approval and conflict details as a row item.

Approvals come from the `gh` or `glab` CLI, run in the workspace's directory on the host about once a
minute while the pull request is open, so the CLI must be installed and signed in there. The required
approval count comes from GitHub branch protection, which only repository admins can usually read;
otherwise the number of approvals is shown on its own. Gitea and Forgejo repositories show no
approval count.
