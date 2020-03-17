import { decodeHTML } from "entities"
import { DatabaseConnection } from "db/DatabaseConnection"
import { ServerSettings } from "serverSettings"
import { ClientSettings } from "clientSettings"
import * as Knex from "knex"
import fetch from "node-fetch"
const urlSlug = require("url-slug")

import { defaultTo } from "charts/Util"
import { Base64 } from "js-base64"
import { registerExitHandler } from "./cleanup"

class WPDB {
    private conn?: DatabaseConnection
    private knexInstance?: Knex
    private serverSettings: ServerSettings

    constructor(serverSettings: ServerSettings) {
        this.serverSettings = serverSettings
    }

    knex(tableName?: string | Knex.Raw | Knex.QueryBuilder | undefined) {
        const {
            WORDPRESS_DB_NAME,
            WORDPRESS_DB_HOST,
            WORDPRESS_DB_PORT,
            WORDPRESS_DB_USER,
            WORDPRESS_DB_PASS
        } = this.serverSettings

        if (!this.knexInstance) {
            this.knexInstance = Knex({
                client: "mysql",
                connection: {
                    host: WORDPRESS_DB_HOST,
                    port: WORDPRESS_DB_PORT,
                    user: WORDPRESS_DB_USER,
                    password: WORDPRESS_DB_PASS,
                    database: WORDPRESS_DB_NAME
                }
            })

            registerExitHandler(async () => {
                if (this.knexInstance) await this.knexInstance.destroy()
            })
        }

        return this.knexInstance(tableName)
    }

    async connect() {
        const {
            WORDPRESS_DB_NAME,
            WORDPRESS_DB_HOST,
            WORDPRESS_DB_PORT,
            WORDPRESS_DB_USER,
            WORDPRESS_DB_PASS
        } = this.serverSettings
        this.conn = new DatabaseConnection({
            host: WORDPRESS_DB_HOST,
            port: WORDPRESS_DB_PORT,
            user: WORDPRESS_DB_USER,
            password: WORDPRESS_DB_PASS,
            database: WORDPRESS_DB_NAME
        })
        await this.conn.connect()

        registerExitHandler(async () => {
            if (this.conn) this.conn.end()
        })
    }

    async query(queryStr: string, params?: any[]): Promise<any[]> {
        if (!this.conn) await this.connect()

        return this.conn!.query(queryStr, params)
    }

    async get(queryStr: string, params?: any[]): Promise<any> {
        if (!this.conn) await this.connect()

        return this.conn!.get(queryStr, params)
    }

    async getCategoriesByPostId(): Promise<Map<number, string[]>> {
        const categoriesByPostId = new Map<number, string[]>()
        const rows = await this.query(`
            SELECT object_id, terms.name FROM wp_term_relationships AS rels
            LEFT JOIN wp_terms AS terms ON terms.term_id=rels.term_taxonomy_id
        `)

        for (const row of rows) {
            let cats = categoriesByPostId.get(row.object_id)
            if (!cats) {
                cats = []
                categoriesByPostId.set(row.object_id, cats)
            }
            cats.push(row.name)
        }

        return categoriesByPostId
    }

    async end() {
        if (this.conn) this.conn.end()
        if (this.knexInstance) await this.knexInstance.destroy()
    }

    // Retrieve a map of post ids to authors
    private cachedAuthorship: Map<number, string[]> | undefined
    async getAuthorship(): Promise<Map<number, string[]>> {
        if (this.cachedAuthorship) return this.cachedAuthorship

        const authorRows = await this.query(`
        SELECT object_id, terms.description FROM wp_term_relationships AS rels
        LEFT JOIN wp_term_taxonomy AS terms ON terms.term_taxonomy_id=rels.term_taxonomy_id
        WHERE terms.taxonomy='author'
        ORDER BY rels.term_order ASC
    `)

        const authorship = new Map<number, string[]>()
        for (const row of authorRows) {
            let authors = authorship.get(row.object_id)
            if (!authors) {
                authors = []
                authorship.set(row.object_id, authors)
            }
            authors.push(
                row.description
                    .split(" ")
                    .slice(0, 2)
                    .join(" ")
            )
        }

        this.cachedAuthorship = authorship
        return authorship
    }

    async getTagsByPostId(): Promise<Map<number, string[]>> {
        const tagsByPostId = new Map<number, string[]>()
        const rows = await this.query(`
        SELECT p.id, t.name
        FROM wp_posts p
        JOIN wp_term_relationships tr
            on (p.id=tr.object_id)
        JOIN wp_term_taxonomy tt
            on (tt.term_taxonomy_id=tr.term_taxonomy_id
            and tt.taxonomy='post_tag')
        JOIN wp_terms t
            on (tt.term_id=t.term_id)
    `)

        for (const row of rows) {
            let cats = tagsByPostId.get(row.id)
            if (!cats) {
                cats = []
                tagsByPostId.set(row.id, cats)
            }
            cats.push(row.name)
        }

        return tagsByPostId
    }

    private cachedFeaturedImages: Map<number, string> | undefined
    async getFeaturedImages() {
        if (this.cachedFeaturedImages) return this.cachedFeaturedImages

        const rows = await this.query(
            `SELECT wp_postmeta.post_id, wp_posts.guid FROM wp_postmeta INNER JOIN wp_posts ON wp_posts.ID=wp_postmeta.meta_value WHERE wp_postmeta.meta_key='_thumbnail_id'`
        )

        const featuredImages = new Map<number, string>()
        for (const row of rows) {
            featuredImages.set(row.post_id, row.guid)
        }

        this.cachedFeaturedImages = featuredImages
        return featuredImages
    }

    private cachedTables: Map<string, TablepressTable> | undefined
    async getTables(): Promise<Map<string, TablepressTable>> {
        if (this.cachedTables) return this.cachedTables

        const optRows = await this.query(`
        SELECT option_value AS json FROM wp_options WHERE option_name='tablepress_tables'
    `)

        const tableToPostIds = JSON.parse(optRows[0].json).table_post

        const rows = await this.query(`
        SELECT ID, post_content FROM wp_posts WHERE post_type='tablepress_table'
    `)

        const tableContents = new Map<string, string>()
        for (const row of rows) {
            tableContents.set(row.ID, row.post_content)
        }

        this.cachedTables = new Map()
        for (const tableId in tableToPostIds) {
            const data = JSON.parse(
                tableContents.get(tableToPostIds[tableId]) || "[]"
            )
            this.cachedTables.set(tableId, {
                tableId: tableId,
                data: data
            })
        }

        return this.cachedTables
    }

    flushCache() {
        this.cachedAuthorship = undefined
        this.cachedEntries = []
        this.cachedFeaturedImages = undefined
        this.cachedPosts = undefined
        this.cachedTables = undefined
    }

    private cachedPosts: FullPost[] | undefined
    async getBlogIndex(clientSettings: ClientSettings): Promise<FullPost[]> {
        if (this.cachedPosts) return this.cachedPosts

        // TODO: do not get post content in the first place
        const posts = await this.getPosts(clientSettings, ["post"])

        this.cachedPosts = posts.map(post => {
            return getFullPost(post, clientSettings.BAKED_BASE_URL, true)
        })

        return this.cachedPosts
    }

    private async apiQuery(
        endpoint: string,
        params?: {
            isAuthenticated?: boolean
            searchParams?: Array<[string, string | number]>
        }
    ): Promise<any> {
        const url = new URL(endpoint)

        if (params && params.searchParams) {
            params.searchParams.forEach(param => {
                url.searchParams.append(param[0], String(param[1]))
            })
        }

        if (params && params.isAuthenticated) {
            return fetch(url.toString(), {
                headers: [
                    [
                        "Authorization",
                        "Basic " +
                            Base64.encode(
                                `${this.serverSettings.WORDPRESS_API_USER}:${this.serverSettings.WORDPRESS_API_PASS}`
                            )
                    ]
                ]
            })
        } else {
            return fetch(url.toString())
        }
    }

    // Retrieve a list of categories and their associated entries
    private cachedEntries: CategoryWithEntries[] = []
    async getEntriesByCategory(
        clientSettings: ClientSettings
    ): Promise<CategoryWithEntries[]> {
        if (this.cachedEntries.length) return this.cachedEntries

        const first = 100
        // The filtering of cached entries below makes the $first argument
        // less accurate, as it does not represent the exact number of entries
        // returned per subcategories but rather their maximum number of entries.
        const orderby = "TERM_ORDER"

        const query = `
    query getEntriesByCategory($first: Int, $orderby: TermObjectsConnectionOrderbyEnum!) {
        categories(first: $first, where: {termTaxonomId: 44, orderby: $orderby}) {
          nodes {
            name
            children(first: $first, where: {orderby: $orderby}) {
              nodes {
                ...categoryWithEntries
                children(first: $first, where: {orderby: $orderby}) {
                  nodes {
                    ...categoryWithEntries
                  }
                }
              }
            }
          }
        }
      }

      fragment categoryWithEntries on Category {
        name
        slug
        pages(first: $first, where: {orderby: {field: MENU_ORDER, order: ASC}}) {
          nodes {
            slug
            title
            excerpt
            kpi
          }
        }
      }
      `

        const response = await fetch(clientSettings.WP_GRAPHQL_ENDPOINT, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Accept: "application/json"
            },
            body: JSON.stringify({
                query,
                variables: { first, orderby }
            })
        })
        const json = await response.json()

        interface CategoryNode {
            name: string
            slug: string
            pages: any
            children: any
        }

        const getEntryNode = ({ slug, title, excerpt, kpi }: EntryNode) => ({
            slug,
            title: decodeHTML(title),
            excerpt: excerpt === null ? "" : decodeHTML(excerpt),
            kpi
        })

        const isEntryInSubcategories = (
            entry: EntryNode,
            subcategories: any
        ) => {
            return subcategories.some((subcategory: any) => {
                return subcategory.pages.nodes.some(
                    (node: EntryNode) => entry.slug === node.slug
                )
            })
        }

        this.cachedEntries = json.data.categories.nodes[0].children.nodes.map(
            ({ name, slug, pages, children }: CategoryNode) => ({
                name: decodeHTML(name),
                slug,
                entries: pages.nodes
                    .filter(
                        (node: EntryNode) =>
                            /* As entries are sometimes listed at all levels of the category hierarchy
                        (e.g. "Entries" > "Demographic Change" > "Life and Death" for "Child and
                        Infant Mortality"), it is necessary to filter out duplicates, by giving precedent to
                        the deepest level. In other words, if an entry is present in category 1 and category
                        1.1, it will only show in category 1.1.

                        N.B. Pre wp-graphql 0.6.0, entries would be returned at all levels of the category
                        hierarchy, no matter what categories were effectively selected. 0.6.0 fixes that
                        (cf. https://github.com/wp-graphql/wp-graphql/issues/1100). Even though this behaviour
                        has been fixed, we still have potential duplicates, from the multiple hierarchical
                        selection as noted above. The only difference is the nature of the duplicate, which can
                        now be considered more intentional as it is coming from the data / CMS.
                        Ultimately, this discrepency in the data should be addressed to make the system
                        less permissive. */
                            !isEntryInSubcategories(node, children.nodes)
                    )
                    .map((node: EntryNode) => getEntryNode(node)),
                subcategories: children.nodes
                    .filter(
                        (subcategory: CategoryNode) =>
                            subcategory.pages.nodes.length !== 0
                    )
                    .map(({ name, slug, pages }: CategoryNode) => ({
                        name: decodeHTML(name),
                        slug,
                        entries: pages.nodes.map((node: EntryNode) =>
                            getEntryNode(node)
                        )
                    }))
            })
        )

        return this.cachedEntries
    }

    // Limit not supported with multiple post types:
    // When passing multiple post types, the limit is applied to the resulting array
    // of sequentially sorted posts (all blog posts, then all pages, ...), so there
    // will be a predominance of a certain post type.
    async getPosts(
        clientSettings: ClientSettings,
        postTypes: string[] = ["post", "page"],
        limit?: number
    ): Promise<any[]> {
        const perPage = 50
        const posts: any[] = []
        let response

        for (const postType of postTypes) {
            const endpoint = `${
                clientSettings.WP_API_ENDPOINT
            }/${getEndpointSlugFromType(postType)}`

            // Get number of items to retrieve
            response = await this.apiQuery(endpoint, {
                searchParams: [["per_page", 1]]
            })
            const maxAvailable = response.headers.get("X-WP-TotalPages")
            const count = limit && limit < maxAvailable ? limit : maxAvailable

            for (let page = 1; page <= Math.ceil(count / perPage); page++) {
                response = await this.apiQuery(endpoint, {
                    searchParams: [
                        ["per_page", perPage],
                        ["page", page]
                    ]
                })
                const postsCurrentPage = await response.json()
                posts.push(...postsCurrentPage)
            }
        }
        return limit ? posts.slice(0, limit) : posts
    }

    private async getPostType(
        search: number | string,
        clientSettings: ClientSettings
    ): Promise<string> {
        const paramName = typeof search === "number" ? "id" : "slug"
        const response = await this.apiQuery(
            `${clientSettings.OWID_API_ENDPOINT}/type`,
            {
                searchParams: [[paramName, search]]
            }
        )
        const type = await response.json()

        return type
    }

    async getPost(id: number, clientSettings: ClientSettings): Promise<any> {
        const type = await this.getPostType(id, clientSettings)
        const response = await this.apiQuery(
            `${clientSettings.WP_API_ENDPOINT}/${getEndpointSlugFromType(
                type
            )}/${id}`
        )
        const post = await response.json()

        return post
    }

    async getPostBySlug(
        slug: string,
        clientSettings: ClientSettings
    ): Promise<any[]> {
        const type = await this.getPostType(slug, clientSettings)
        const response = await this.apiQuery(
            `${clientSettings.WP_API_ENDPOINT}/${getEndpointSlugFromType(
                type
            )}`,
            {
                searchParams: [["slug", slug]]
            }
        )
        const postArray = await response.json()

        return postArray
    }

    async getLatestPostRevision(
        id: number,
        clientSettings: ClientSettings
    ): Promise<any> {
        const type = await this.getPostType(id, clientSettings)
        const response = await this.apiQuery(
            `${clientSettings.WP_API_ENDPOINT}/${getEndpointSlugFromType(
                type
            )}/${id}/revisions`,
            {
                isAuthenticated: true
            }
        )
        const revisions = await response.json()

        return revisions[0]
    }

    getPermalinksFn() {
        // Strip trailing slashes, and convert __ into / to allow custom subdirs like /about/media-coverage
        return (ID: number, postName: string) =>
            postName
                .replace(/\/+$/g, "")
                .replace(/--/g, "/")
                .replace(/__/g, "/")
    }

    isPostEmbedded(post: FullPost): boolean {
        return post.path.indexOf("#") !== -1
    }

    getFullPost(
        postApi: any,
        bakedBaseUrl: string,
        excludeContent?: boolean
    ): FullPost {
        return {
            id: postApi.id,
            postId: postApi.postId, // for previews, the `id` is the revision ID, this field stores the original post ID
            type: postApi.type,
            slug: postApi.slug,
            path:
                postApi.reading_context && postApi.reading_context === "entry"
                    ? `${postApi.path}#${urlSlug(postApi.first_heading)}`
                    : postApi.path,
            title: decodeHTML(postApi.title.rendered),
            date: new Date(postApi.date),
            modifiedDate: new Date(postApi.modified),
            authors: postApi.authors_name || [],
            content: excludeContent ? "" : postApi.content.rendered,
            excerpt: decodeHTML(postApi.excerpt.rendered),
            imageUrl: `${bakedBaseUrl}${defaultTo(
                postApi.featured_media_path,
                "/default-thumbnail.jpg"
            )}`
        }
    }
}

// TODO: cleanup
export const dbInstance = new WPDB(new ServerSettings())

export interface EntryMeta {
    slug: string
    title: string
    excerpt: string
    kpi: string
}

export interface CategoryWithEntries {
    name: string
    slug: string
    entries: EntryMeta[]
    subcategories: CategoryWithEntries[]
}

export interface EntryNode {
    slug: string
    title: string
    // in some edge cases (entry alone in a subcategory), WPGraphQL returns
    // null instead of an empty string)
    excerpt: string | null
    kpi: string
}

function getEndpointSlugFromType(type: string): string {
    // page => pages, post => posts
    return `${type}s`
}

export interface FullPost {
    id: number
    type: "post" | "page"
    slug: string
    path: string
    title: string
    date: Date
    modifiedDate: Date
    authors: string[]
    content: string
    excerpt?: string
    imageUrl?: string
    postId?: number
}

interface TablepressTable {
    tableId: string
    data: string[][]
}
