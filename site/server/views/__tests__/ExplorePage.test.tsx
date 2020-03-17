#! /usr/bin/env jest

import * as React from "react"
import { shallow } from "enzyme"

import { ClientSettings } from "clientSettings"
const clientSettings = new ClientSettings()

import { ExplorePage } from "../ExplorePage"
import { SiteHeader } from "../SiteHeader"
import { SiteFooter } from "../SiteFooter"

describe(ExplorePage, () => {
    it("renders a site header", () => {
        expect(
            shallow(<ExplorePage clientSettings={clientSettings} />).find(
                SiteHeader
            ).length
        ).toBe(1)
    })

    it("renders an 'explore' element", () => {
        expect(
            shallow(<ExplorePage clientSettings={clientSettings} />).find(
                "#explore"
            ).length
        ).toBe(1)
    })

    it("renders a site footer", () => {
        expect(
            shallow(<ExplorePage clientSettings={clientSettings} />).find(
                SiteFooter
            ).length
        ).toBe(1)
    })
})
