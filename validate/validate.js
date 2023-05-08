module.exports = async ({ github, context, core }) => {
    const issueForm = JSON.parse(process.env.ISSUE_FORM_JSON)
    const access = issueForm["repository-access"].text
    const description = issueForm["repository-description"].text
    const justification = issueForm["repository-justification"].text
    const name = issueForm["repository-name"].text
    const owner = issueForm["repository-owner"].text
    const visibility = issueForm["repository-visibility"].text?.toLowerCase()

    core.setOutput('repository-access', access)
    core.setOutput('repository-description', description)
    core.setOutput('repository-justification', justification)
    core.setOutput('repository-name', name)
    core.setOutput('repository-owner', owner)
    core.setOutput('repository-visibility', visibility)

    const errors = []

    // Ensure organization does exist
    try {
        const response = await github.rest.orgs.get({
            org: owner,
        })
    } catch (error) {
        errors.push(`Please update **Repository owner** as ${owner} does not exist`)
    }

    // Ensure repository does not exist
    try {
        const response = await github.rest.repos.get({
            owner: owner,
            repo: name,
        })

        errors.push(`Please update **Repository name** as ${owner}/${name} already exists`)
    } catch (error) {
        if (error.status !== 404) {
            errors.push(`Issue arose checking if ${owner}/${name} already exists; please review workflow logs`)
        }
    }

    // Ensure justification is provided if non-internal visibility is selected
    if (visibility != 'internal' && justification == '*No response*') {
        errors.push(`Please update **Repository justification** regarding the need for \`${visibility}\` visibility`)
    }

    // Ensure teams specified exist
    const items = decodeURIComponent(access).split('\n').map(str => str.trim()).filter(str => str.length)
    const team_owner_regex = /@(.*)\/(.*)/
    const assignments = []
    const reserved_permissions = ['read', 'pull', 'write', 'push', 'triage', 'maintain', 'admin']

    for (const item of items) {
        let org = owner
        let [team_slug, permission] = item.split(',').map(str => str.trim())
        const team_owner_match = team_owner_regex.exec(team_slug)

        // Account for possibility of team owner being different from repository organization
        if (team_owner_match) {
            org = team_owner_match[1]
            team_slug = team_owner_match[2]
        }

        // Handle mixed case for reserved permissions
        const reserved_permission = permission?.toLowerCase()

        if (reserved_permissions.includes(reserved_permission)) {
            permission = reserved_permission
        }

        // Remap between permission difference between UI and API
        if (permission == 'read') {
            permission = 'pull'
        } else if (permission == 'write') {
            permission = 'push'
        }

        const data = {
            org: org,
            team_slug: team_slug,
            owner: owner,
            repo: name,
            permission: permission,
        }

        try {
            await github.rest.teams.getByName({
                org: data.org,
                team_slug: data.team_slug,
            })
            assignments.push(data)
        } catch (error) {
            errors.push(`Please update **Repository access** as ${data.org}/${data.team_slug} does not exist`)
        }
    }

    if (errors.length) {
        core.setFailed(`${errors.length} errors were found in validating inputs; please follow up as appropriately.`)
    }

    core.setOutput('repository-assignments', assignments)
    core.setOutput('errors', errors)
}