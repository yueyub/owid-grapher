#! /usr/bin/env jest

import { ClientSettings } from "clientSettings"

describe("ClientSettings", () => {
    it("has an env set", () => {
        const config = new ClientSettings()
        expect(config.ENV).toBe("development")
    })

    it("has a grapher url set", () => {
        const config = new ClientSettings()
        expect(config.BAKED_GRAPHER_URL).toBeTruthy()
    })
})
