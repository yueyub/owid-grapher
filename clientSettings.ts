import { parseBool } from "utils/string"
import urljoin = require("url-join")
import * as path from "path"

// All of this information is available to the client-side code
// DO NOT retrieve sensitive information from the environment in here! :O

export class ClientSettings {
    ENV =
        process.env.ENV === "production" ||
        process.env.NODE_ENV === "production"
            ? "production"
            : "development"

    ADMIN_SERVER_HOST: string = process.env.ADMIN_SERVER_HOST || "localhost"

    ADMIN_SERVER_PORT: number = process.env.ADMIN_SERVER_PORT
        ? parseInt(process.env.ADMIN_SERVER_PORT)
        : 3030

    BAKED_DEV_SERVER_HOST: string =
        process.env.BAKED_DEV_SERVER_HOST || "localhost"

    BAKED_DEV_SERVER_PORT: number = process.env.BAKED_DEV_SERVER_PORT
        ? parseInt(process.env.BAKED_DEV_SERVER_PORT)
        : 3099

    WEBPACK_DEV_URL: string =
        process.env.WEBPACK_DEV_URL || "http://localhost:8090"

    // TODO: This is duplicated in serverSettings
    WEBPACK_OUTPUT_PATH: string =
        process.env.WEBPACK_OUTPUT_PATH || path.join(__dirname, "dist/webpack")

    BAKED_BASE_URL: string =
        process.env.BAKED_BASE_URL ||
        `http://${this.BAKED_DEV_SERVER_HOST}:${this.BAKED_DEV_SERVER_PORT}`

    BAKED_GRAPHER_URL: string =
        process.env.BAKED_GRAPHER_URL || `${this.BAKED_BASE_URL}/grapher`

    ADMIN_BASE_URL: string =
        process.env.ADMIN_BASE_URL ||
        `http://${this.ADMIN_SERVER_HOST}:${this.ADMIN_SERVER_PORT}`

    WORDPRESS_URL: string = process.env.WORDPRESS_URL || "https://owid.cloud"

    WP_API_ENDPOINT = `${this.WORDPRESS_URL}/wp-json/wp/v2`
    OWID_API_ENDPOINT = `${this.WORDPRESS_URL}/wp-json/owid/v1`
    WP_GRAPHQL_ENDPOINT = `${this.WORDPRESS_URL}/wp/graphql`

    // Settings for git export and version tracking of database
    GITHUB_USERNAME: string = process.env.GITHUB_USERNAME || "owid-test"

    GIT_DEFAULT_USERNAME: string =
        process.env.GIT_DEFAULT_USERNAME || "Our World in Data"

    GIT_DEFAULT_EMAIL: string =
        process.env.GIT_DEFAULT_EMAIL || "info@ourworldindata.org"

    BLOG_POSTS_PER_PAGE: number = 20

    ALGOLIA_ID: string = process.env.ALGOLIA_ID || ""

    ALGOLIA_SEARCH_KEY: string = process.env.ALGOLIA_SEARCH_KEY || ""

    STRIPE_PUBLIC_KEY: string =
        process.env.STRIPE_PUBLIC_KEY || "pk_test_nIHvmH37zsoltpw3xMssPIYq"

    DONATE_API_URL: string =
        process.env.DONATE_API_URL || "http://localhost:9000/donate"

    RECAPTCHA_SITE_KEY: string =
        process.env.RECAPTCHA_SITE_KEY ||
        "6LcJl5YUAAAAAATQ6F4vl9dAWRZeKPBm15MAZj4Q"

    // XXX hardcoded filtering to public parent tags
    PUBLIC_TAG_PARENT_IDS: number[] = [
        1515,
        1507,
        1513,
        1504,
        1502,
        1509,
        1506,
        1501,
        1514,
        1511,
        1500,
        1503,
        1505,
        1508,
        1512,
        1510
    ]

    // Feature flag for explorable charts
    EXPLORER: boolean = process.env.EXPLORER
        ? parseBool(process.env.EXPLORER)
        : false

    private webpackManifest?: { [key: string]: string }
    getWebPackUrl(assetName: string) {
        if (assetName.match(/\.js$/)) {
            assetName = `js/${assetName}`
        } else if (assetName.match(/\.css$/)) {
            assetName = `css/${assetName}`
        }

        if (this.ENV === "production")
            return urljoin(this.BAKED_BASE_URL, "/assets", assetName)
        return urljoin(this.WEBPACK_DEV_URL, assetName)
    }
}
