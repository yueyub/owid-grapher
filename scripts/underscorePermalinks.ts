import * as wpdb from "db/wpdb"

async function undoPermalinks() {
    const rows = await wpdb.dbInstance.query(
        `SELECT post_id, meta_value FROM wp_postmeta WHERE meta_key='custom_permalink'`
    )

    for (const row of rows) {
        await wpdb.dbInstance.query(
            `UPDATE wp_posts SET post_name = ? WHERE ID=?`,
            [
                row.meta_value
                    .replace(/\/+$/g, "")
                    .replace(/\//g, "__")
                    .replace(/--/g, "__"),
                row.post_id
            ]
        )
    }

    wpdb.dbInstance.end()
}

undoPermalinks()
