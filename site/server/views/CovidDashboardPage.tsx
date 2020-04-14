import * as settings from "settings"
import * as React from "react"
import { Head } from "./Head"
import { SiteFooter } from "./SiteFooter"
import { SiteHeader } from "./SiteHeader"

export default function CovidDashboardPage() {
    return (
        <html>
            <Head
                pageTitle="Covid Dashboard"
                canonicalUrl={`${settings.BAKED_BASE_URL}/covidDashboard`}
            ></Head>
            <body className="CovidDashboardPage">
                <SiteHeader />
                <main>
                    <h1>Covid Dashabord</h1>
                    <p>Hello world</p>
                </main>
                <SiteFooter />
            </body>
        </html>
    )
}
