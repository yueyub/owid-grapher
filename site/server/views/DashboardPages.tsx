import * as settings from "settings"
import * as React from "react"
import { Head } from "./Head"
import { SiteFooter } from "./SiteFooter"
import { SiteHeader } from "./SiteHeader"

class DashboardPage extends React.Component<{
    title: string
    canonicalUrl: string
}> {
    render() {
        const props = this.props
        const { title, canonicalUrl } = props
        const script = `
        window.DashboardView.bootstrap({ containerNode: document.getElementById('dashboard'), queryStr: window.location.search });
    `
        return (
            <html>
                <Head pageTitle={title} canonicalUrl={canonicalUrl}></Head>
                <body className="DashboardPage">
                    <SiteHeader />
                    <main>
                        <div id="dashboard"></div>
                    </main>
                    <SiteFooter />
                    <script dangerouslySetInnerHTML={{ __html: script }} />
                </body>
            </html>
        )
    }
}

export class CovidDashboardPage extends React.Component {
    render() {
        return (
            <DashboardPage
                title="Covid Dashboard"
                canonicalUrl={`${settings.BAKED_BASE_URL}/covidDashboard`}
            />
        )
    }
}
