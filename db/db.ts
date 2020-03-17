import * as mysql from "mysql"
import * as typeorm from "typeorm"
import * as Knex from "knex"
import { ServerSettings } from "serverSettings"
const serverSettings = new ServerSettings()
const { DB_NAME, DB_USER, DB_PASS, DB_HOST, DB_PORT } = serverSettings

import { registerExitHandler } from "./cleanup"
let ormDbConnection: typeorm.Connection

export async function connect() {
    return getOrmDbConnection()
}

async function getOrmDbConnection() {
    if (ormDbConnection) return ormDbConnection

    try {
        ormDbConnection = typeorm.getConnection()
    } catch (e) {
        if (e.name === "ConnectionNotFoundError") {
            ormDbConnection = await typeorm.createConnection()
        } else {
            throw e
        }
    }

    registerExitHandler(async () => {
        if (ormDbConnection) await ormDbConnection.close()
    })

    return ormDbConnection
}

export class TransactionContext {
    manager: typeorm.EntityManager
    constructor(manager: typeorm.EntityManager) {
        this.manager = manager
    }

    execute(queryStr: string, params?: any[]): Promise<any> {
        return this.manager.query(
            params ? mysql.format(queryStr, params) : queryStr
        )
    }

    query(queryStr: string, params?: any[]): Promise<any> {
        return this.manager.query(
            params ? mysql.format(queryStr, params) : queryStr
        )
    }
}

export async function transaction<T>(
    callback: (t: TransactionContext) => Promise<T>
): Promise<T> {
    return (await getOrmDbConnection()).transaction(async manager => {
        const t = new TransactionContext(manager)
        return callback(t)
    })
}

export async function query(queryStr: string, params?: any[]): Promise<any> {
    const conn = await getOrmDbConnection()
    return conn.query(params ? mysql.format(queryStr, params) : queryStr)
}

// For operations that modify data (TODO: handling to check query isn't used for this)
export async function execute(queryStr: string, params?: any[]): Promise<any> {
    const conn = await getOrmDbConnection()
    return conn.query(params ? mysql.format(queryStr, params) : queryStr)
}

export async function get(queryStr: string, params?: any[]): Promise<any> {
    return (await query(queryStr, params))[0]
}

export async function end() {
    if (ormDbConnection) await ormDbConnection.close()
    if (knexInstance) await knexInstance.destroy()
}

let knexInstance: Knex

export function knex() {
    if (!knexInstance) {
        knexInstance = Knex({
            client: "mysql",
            connection: {
                host: DB_HOST,
                user: DB_USER,
                password: DB_PASS,
                database: DB_NAME,
                port: DB_PORT,
                typeCast: (field: any, next: any) => {
                    if (field.type === "TINY" && field.length === 1) {
                        return field.string() === "1" // 1 = true, 0 = false
                    }
                    return next()
                }
            }
        })

        registerExitHandler(async () => {
            if (knexInstance) await knexInstance.destroy()
        })
    }

    return knexInstance
}

export function table(t: string) {
    return knex().table(t)
}

export function raw(s: string) {
    return knex().raw(s)
}

export async function select<T, K extends keyof T>(
    query: Knex.QueryBuilder,
    ...args: K[]
): Promise<Pick<T, K>[]> {
    return query.select(...args) as any
}
