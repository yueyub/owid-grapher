// This is where server-side only, potentially sensitive settings enter from the environment
// DO NOT store sensitive strings in this file itself, as it is checked in to git!

import * as path from "path"
import { parseBool } from "utils/string"

function expect(key: string): string {
    const val = process.env[key]
    if (val === undefined) {
        throw new Error(`OWID requires an environment variable for ${key}`)
    } else {
        return val
    }
}

export class ServerSettings {
    BASE_DIR: string = __dirname

    ENV =
        process.env.ENV === "production" ||
        process.env.NODE_ENV === "production"
            ? "production"
            : "development"

    SECRET_KEY: string =
        this.ENV === "production"
            ? expect("SECRET_KEY")
            : "not a very secret key at all"

    SESSION_COOKIE_AGE: number = process.env.SESSION_COOKIE_AGE
        ? parseInt(process.env.SESSION_COOKIE_AGE)
        : 1209600

    ALGOLIA_SECRET_KEY: string = process.env.ALGOLIA_SECRET_KEY || ""

    STRIPE_SECRET_KEY: string = process.env.STRIPE_SECRET_KEY || ""

    // Grapher database settings
    DB_NAME: string = process.env.DB_NAME || ""
    DB_USER: string = process.env.DB_USER || "root"
    DB_PASS: string = process.env.DB_PASS || ""
    DB_HOST: string = process.env.DB_HOST || "localhost"
    DB_PORT: number = process.env.DB_PORT ? parseInt(process.env.DB_PORT) : 3306

    // Wordpress database settings
    WORDPRESS_DB_NAME: string =
        process.env.WORDPRESS_DB_NAME || process.env.DB_NAME || ""
    WORDPRESS_DB_USER: string =
        process.env.WORDPRESS_DB_USER || process.env.DB_USER || "root"
    WORDPRESS_DB_PASS: string =
        process.env.WORDPRESS_DB_PASS || process.env.DB_PASS || ""
    WORDPRESS_DB_HOST: string =
        process.env.WORDPRESS_DB_HOST || process.env.DB_HOST || "localhost"
    WORDPRESS_DB_PORT: number = process.env.WORDPRESS_DB_PORT
        ? parseInt(process.env.WORDPRESS_DB_PORT)
        : process.env.DB_PORT
        ? parseInt(process.env.DB_PORT)
        : 3306
    WORDPRESS_API_USER: string = process.env.WORDPRESS_API_USER || ""
    WORDPRESS_API_PASS: string = process.env.WORDPRESS_API_PASS || ""

    // Where the static build output goes
    BAKED_SITE_DIR: string =
        process.env.BAKED_SITE_DIR || path.join(this.BASE_DIR, "bakedSite")
    WEBPACK_OUTPUT_PATH: string =
        process.env.WEBPACK_OUTPUT_PATH ||
        path.join(this.BASE_DIR, "dist/webpack")

    // Settings for automated email sending, e.g. for admin invites
    EMAIL_HOST: string = process.env.EMAIL_HOST || "smtp.mail.com"
    EMAIL_PORT: number = process.env.EMAIL_PORT
        ? parseInt(process.env.EMAIL_PORT)
        : 443
    EMAIL_HOST_USER: string = process.env.EMAIL_HOST_USER || "user"
    EMAIL_HOST_PASSWORD: string = process.env.EMAIL_HOST_PASSWORD || "password"

    // Wordpress target settings
    WORDPRESS_DIR: string = process.env.WORDPRESS_DIR || ""
    HTTPS_ONLY: boolean = true

    // Node slack webhook to report errors to using express-error-slack
    SLACK_ERRORS_WEBHOOK_URL: string =
        process.env.SLACK_ERRORS_WEBHOOK_URL || ""

    // Where the git exports go
    GIT_DATASETS_DIR: string =
        process.env.GIT_DATASETS_DIR ||
        path.join(this.BASE_DIR, "datasetsExport")
    TMP_DIR: string = process.env.TMP_DIR || "/tmp"

    UNCATEGORIZED_TAG_ID: number = process.env.UNCATEGORIZED_TAG_ID
        ? parseInt(process.env.UNCATEGORIZED_TAG_ID as any)
        : 375

    // Should the static site output be baked when relevant database items change?
    BAKE_ON_CHANGE: boolean = process.env.BAKE_ON_CHANGE
        ? parseBool(process.env.BAKE_ON_CHANGE)
        : this.ENV === "production"
        ? true
        : false

    // Deploy queue settings
    DEPLOY_QUEUE_FILE_PATH =
        process.env.DEPLOY_QUEUE_FILE_PATH ||
        path.join(this.BASE_DIR, "./.queue")
    DEPLOY_PENDING_FILE_PATH =
        process.env.DEPLOY_PENDING_FILE_PATH ||
        path.join(this.BASE_DIR, "./.pending")
}
