import {
  Document,
  Page,
  View,
  Text,
  StyleSheet,
} from '@react-pdf/renderer';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ReportData {
  appName: string;
  appDescription: string;
  imageTag: string;
  imageDigest?: string;
  scanDate: string;
  reportGeneratedAt: string;
  riskScore: number;
  scans: Array<{
    scanner: string;
    scanType: string;
    scannedAt: string;
    findings: { critical: number; high: number; medium: number; low: number; info: number };
  }>;
  findings: Array<{
    id: string;
    title: string;
    severity: string;
    scanner: string;
    scanType: string;
    filePath?: string;
    lineNumber?: number;
    cwe?: string;
    cve?: string;
    description: string;
    remediation?: string;
    status: string;
    foundAt: string;
  }>;
}

// ---------------------------------------------------------------------------
// Color constants
// ---------------------------------------------------------------------------

const COLORS = {
  critical: '#ef4444',
  criticalLight: '#fee2e2',
  criticalText: '#b91c1c',
  high: '#f97316',
  highLight: '#ffedd5',
  highText: '#c2410c',
  medium: '#eab308',
  mediumLight: '#fef9c3',
  mediumText: '#854d0e',
  low: '#3b82f6',
  lowLight: '#dbeafe',
  lowText: '#1d4ed8',
  info: '#94a3b8',
  infoLight: '#f1f5f9',
  infoText: '#475569',
  navy: '#1e293b',
  navyLight: '#334155',
  yellow: '#FFC70A',
  white: '#ffffff',
  offWhite: '#f8fafc',
  lightGray: '#e2e8f0',
  midGray: '#94a3b8',
  darkGray: '#475569',
  black: '#0f172a',
  green: '#16a34a',
  greenLight: '#dcfce7',
  greenText: '#15803d',
  divider: '#e2e8f0',
};

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  // ---- Page ----
  page: {
    fontFamily: 'Helvetica',
    fontSize: 9,
    color: COLORS.black,
    paddingTop: 40,
    paddingBottom: 60,
    paddingHorizontal: 40,
    backgroundColor: COLORS.white,
  },
  coverPage: {
    fontFamily: 'Helvetica',
    fontSize: 9,
    color: COLORS.black,
    padding: 0,
    backgroundColor: COLORS.offWhite,
  },

  // ---- Cover: top bar ----
  coverTopBar: {
    backgroundColor: COLORS.navy,
    paddingHorizontal: 40,
    paddingVertical: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  coverTopBarTitle: {
    color: COLORS.white,
    fontFamily: 'Helvetica-Bold',
    fontSize: 10,
    letterSpacing: 2,
  },
  coverTopBarDate: {
    color: COLORS.midGray,
    fontSize: 8,
  },

  // ---- Cover: yellow stripe ----
  coverAccentStripe: {
    backgroundColor: COLORS.yellow,
    height: 4,
  },

  // ---- Cover: hero area ----
  coverHero: {
    paddingHorizontal: 40,
    paddingTop: 80,
    paddingBottom: 40,
    flex: 1,
  },
  coverEyebrow: {
    fontSize: 10,
    color: COLORS.midGray,
    letterSpacing: 2,
    marginBottom: 16,
    fontFamily: 'Helvetica',
    textTransform: 'uppercase',
  },
  coverTitle: {
    fontSize: 36,
    fontFamily: 'Helvetica-Bold',
    color: COLORS.navy,
    marginBottom: 12,
    lineHeight: 1.2,
  },
  coverSubtitle: {
    fontSize: 18,
    fontFamily: 'Helvetica',
    color: COLORS.navyLight,
    marginBottom: 40,
  },

  // ---- Cover: meta grid ----
  coverMetaRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  coverMetaBox: {
    flex: 1,
    backgroundColor: COLORS.white,
    borderRadius: 6,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.lightGray,
  },
  coverMetaLabel: {
    fontSize: 7,
    color: COLORS.midGray,
    fontFamily: 'Helvetica',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 6,
  },
  coverMetaValue: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    color: COLORS.navy,
  },

  // ---- Cover: risk badge ----
  riskBadgeCritical: {
    backgroundColor: COLORS.critical,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 4,
    alignSelf: 'flex-start',
  },
  riskBadgeHigh: {
    backgroundColor: COLORS.high,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 4,
    alignSelf: 'flex-start',
  },
  riskBadgeMedium: {
    backgroundColor: COLORS.medium,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 4,
    alignSelf: 'flex-start',
  },
  riskBadgeLow: {
    backgroundColor: COLORS.low,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 4,
    alignSelf: 'flex-start',
  },
  riskBadgeText: {
    color: COLORS.white,
    fontFamily: 'Helvetica-Bold',
    fontSize: 11,
  },

  // ---- Cover: bottom bar ----
  coverBottomBar: {
    backgroundColor: COLORS.navy,
    paddingHorizontal: 40,
    paddingVertical: 18,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  coverConfidential: {
    color: COLORS.yellow,
    fontFamily: 'Helvetica-Bold',
    fontSize: 8,
    letterSpacing: 1,
  },
  coverOrgText: {
    color: COLORS.midGray,
    fontSize: 8,
  },

  // ---- Section header ----
  sectionHeader: {
    marginBottom: 16,
    backgroundColor: COLORS.navy,
    borderLeftWidth: 4,
    borderLeftColor: COLORS.yellow,
    borderRadius: 4,
    paddingVertical: 9,
    paddingHorizontal: 12,
  },
  sectionTitle: {
    fontSize: 14,
    fontFamily: 'Helvetica-Bold',
    color: COLORS.white,
    letterSpacing: 0.3,
  },
  sectionSubtitle: {
    fontSize: 9,
    color: COLORS.lightGray,
    marginTop: 2,
  },

  // ---- App info table ----
  infoTable: {
    marginBottom: 20,
    borderWidth: 1,
    borderColor: COLORS.lightGray,
    borderRadius: 4,
    overflow: 'hidden',
  },
  infoTableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.lightGray,
  },
  infoTableRowLast: {
    flexDirection: 'row',
  },
  infoTableRowAlt: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.lightGray,
    backgroundColor: COLORS.offWhite,
  },
  infoTableRowAltLast: {
    flexDirection: 'row',
    backgroundColor: COLORS.offWhite,
  },
  infoTableLabel: {
    width: '30%',
    padding: 8,
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    color: COLORS.darkGray,
    backgroundColor: COLORS.offWhite,
    borderRightWidth: 1,
    borderRightColor: COLORS.lightGray,
  },
  infoTableValue: {
    flex: 1,
    padding: 8,
    fontSize: 8,
    color: COLORS.black,
  },

  // ---- Severity summary boxes ----
  summaryBoxRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 20,
  },
  summaryBox: {
    flex: 1,
    borderRadius: 6,
    padding: 12,
    alignItems: 'center',
  },
  summaryBoxCritical: {
    backgroundColor: COLORS.critical,
  },
  summaryBoxHigh: {
    backgroundColor: COLORS.high,
  },
  summaryBoxMedium: {
    backgroundColor: COLORS.medium,
  },
  summaryBoxLow: {
    backgroundColor: COLORS.low,
  },
  summaryBoxInfo: {
    backgroundColor: COLORS.info,
  },
  summaryBoxCount: {
    fontSize: 24,
    fontFamily: 'Helvetica-Bold',
    color: COLORS.white,
    marginBottom: 4,
  },
  summaryBoxLabel: {
    fontSize: 7,
    fontFamily: 'Helvetica-Bold',
    color: COLORS.white,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },

  // ---- Scanner table ----
  scannerTable: {
    borderWidth: 1,
    borderColor: COLORS.lightGray,
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 20,
  },
  scannerTableHeaderRow: {
    flexDirection: 'row',
    backgroundColor: COLORS.navy,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  scannerTableHeaderCell: {
    color: COLORS.white,
    fontFamily: 'Helvetica-Bold',
    fontSize: 8,
    flex: 1,
  },
  scannerTableHeaderCellNarrow: {
    color: COLORS.white,
    fontFamily: 'Helvetica-Bold',
    fontSize: 8,
    width: 40,
    textAlign: 'center',
  },
  scannerTableRow: {
    flexDirection: 'row',
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderTopWidth: 1,
    borderTopColor: COLORS.lightGray,
  },
  scannerTableRowAlt: {
    flexDirection: 'row',
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderTopWidth: 1,
    borderTopColor: COLORS.lightGray,
    backgroundColor: COLORS.offWhite,
  },
  scannerTableCell: {
    flex: 1,
    fontSize: 8,
    color: COLORS.black,
  },
  scannerTableCellNarrow: {
    width: 40,
    fontSize: 8,
    textAlign: 'center',
    fontFamily: 'Helvetica-Bold',
  },
  scannerCellCritical: {
    color: COLORS.critical,
  },
  scannerCellHigh: {
    color: COLORS.high,
  },
  scannerCellMedium: {
    color: COLORS.mediumText,
  },
  scannerCellLow: {
    color: COLORS.low,
  },

  // ---- Findings section header ----
  findingsSeverityBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
    marginTop: 6,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 4,
  },
  findingsSeverityBannerCritical: {
    backgroundColor: COLORS.critical,
  },
  findingsSeverityBannerHigh: {
    backgroundColor: COLORS.high,
  },
  findingsSeverityBannerMedium: {
    backgroundColor: COLORS.medium,
  },
  findingsSeverityBannerLow: {
    backgroundColor: COLORS.low,
  },
  findingsSeverityBannerInfo: {
    backgroundColor: COLORS.info,
  },
  findingsSeverityBannerText: {
    color: COLORS.white,
    fontFamily: 'Helvetica-Bold',
    fontSize: 11,
    flex: 1,
  },
  findingsSeverityBannerCount: {
    color: COLORS.white,
    fontFamily: 'Helvetica-Bold',
    fontSize: 9,
  },

  // ---- Finding block ----
  findingBlock: {
    marginBottom: 16,
    paddingBottom: 16,
  },
  findingDivider: {
    height: 1,
    backgroundColor: COLORS.divider,
    marginBottom: 16,
  },
  findingTitle: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    color: COLORS.white,
    marginBottom: 8,
    lineHeight: 1.4,
    backgroundColor: COLORS.navy,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.yellow,
    borderRadius: 3,
    paddingVertical: 6,
    paddingHorizontal: 9,
  },
  findingBadgeRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 10,
    flexWrap: 'wrap',
  },
  badge: {
    borderRadius: 3,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  badgeCritical: {
    backgroundColor: COLORS.criticalLight,
  },
  badgeHigh: {
    backgroundColor: COLORS.highLight,
  },
  badgeMedium: {
    backgroundColor: COLORS.mediumLight,
  },
  badgeLow: {
    backgroundColor: COLORS.lowLight,
  },
  badgeInfo: {
    backgroundColor: COLORS.infoLight,
  },
  badgeTextCritical: {
    color: COLORS.criticalText,
    fontFamily: 'Helvetica-Bold',
    fontSize: 7,
    textTransform: 'uppercase',
  },
  badgeTextHigh: {
    color: COLORS.highText,
    fontFamily: 'Helvetica-Bold',
    fontSize: 7,
    textTransform: 'uppercase',
  },
  badgeTextMedium: {
    color: COLORS.mediumText,
    fontFamily: 'Helvetica-Bold',
    fontSize: 7,
    textTransform: 'uppercase',
  },
  badgeTextLow: {
    color: COLORS.lowText,
    fontFamily: 'Helvetica-Bold',
    fontSize: 7,
    textTransform: 'uppercase',
  },
  badgeTextInfo: {
    color: COLORS.infoText,
    fontFamily: 'Helvetica-Bold',
    fontSize: 7,
    textTransform: 'uppercase',
  },
  badgeStatus: {
    backgroundColor: COLORS.offWhite,
    borderWidth: 1,
    borderColor: COLORS.lightGray,
  },
  badgeStatusText: {
    color: COLORS.darkGray,
    fontSize: 7,
    fontFamily: 'Helvetica-Bold',
  },
  badgeScanner: {
    backgroundColor: COLORS.navy,
  },
  badgeScannerText: {
    color: COLORS.white,
    fontSize: 7,
    fontFamily: 'Helvetica-Bold',
  },
  badgeScanType: {
    backgroundColor: COLORS.navyLight,
  },
  badgeScanTypeText: {
    color: COLORS.white,
    fontSize: 7,
  },

  // ---- Finding detail rows ----
  findingMetaRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 5,
  },
  findingMetaLabel: {
    width: 80,
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    color: COLORS.darkGray,
  },
  findingMetaValue: {
    flex: 1,
    fontSize: 8,
    color: COLORS.black,
    lineHeight: 1.4,
  },
  findingMetaValueMono: {
    flex: 1,
    fontSize: 8,
    color: COLORS.navyLight,
    fontFamily: 'Helvetica',
  },

  // ---- Description ----
  findingDescriptionBox: {
    backgroundColor: COLORS.offWhite,
    borderRadius: 4,
    padding: 10,
    marginBottom: 8,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.lightGray,
  },
  findingDescriptionLabel: {
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    color: COLORS.darkGray,
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  findingDescriptionText: {
    fontSize: 8,
    color: COLORS.black,
    lineHeight: 1.5,
  },

  // ---- Remediation ----
  findingRemediationBox: {
    backgroundColor: COLORS.greenLight,
    borderRadius: 4,
    padding: 10,
    marginBottom: 8,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.green,
  },
  findingRemediationLabel: {
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    color: COLORS.greenText,
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  findingRemediationText: {
    fontSize: 8,
    color: COLORS.greenText,
    lineHeight: 1.5,
  },

  // ---- Footer ----
  footer: {
    position: 'absolute',
    bottom: 20,
    left: 40,
    right: 40,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: COLORS.lightGray,
    paddingTop: 8,
  },
  footerLeft: {
    fontSize: 7,
    color: COLORS.midGray,
  },
  footerCenter: {
    fontSize: 7,
    color: COLORS.midGray,
    fontFamily: 'Helvetica-Bold',
  },
  footerRight: {
    fontSize: 7,
    color: COLORS.midGray,
  },

  // ---- Utility ----
  pageContent: {
    flex: 1,
  },
  mb4: { marginBottom: 4 },
  mb8: { marginBottom: 8 },
  mb12: { marginBottom: 12 },
  mb16: { marginBottom: 16 },
  mb20: { marginBottom: 20 },
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SEVERITY_ORDER = ['critical', 'high', 'medium', 'low', 'info'];

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

function formatDateTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function getRiskLabel(score: number): string {
  if (score >= 75) return 'CRITICAL RISK';
  if (score >= 50) return 'HIGH RISK';
  if (score >= 25) return 'MEDIUM RISK';
  return 'LOW RISK';
}

function getRiskBadgeStyle(score: number) {
  if (score >= 75) return styles.riskBadgeCritical;
  if (score >= 50) return styles.riskBadgeHigh;
  if (score >= 25) return styles.riskBadgeMedium;
  return styles.riskBadgeLow;
}

function getSeverityBadgeStyle(severity: string) {
  switch (severity.toLowerCase()) {
    case 'critical': return styles.badgeCritical;
    case 'high': return styles.badgeHigh;
    case 'medium': return styles.badgeMedium;
    case 'low': return styles.badgeLow;
    default: return styles.badgeInfo;
  }
}

function getSeverityTextStyle(severity: string) {
  switch (severity.toLowerCase()) {
    case 'critical': return styles.badgeTextCritical;
    case 'high': return styles.badgeTextHigh;
    case 'medium': return styles.badgeTextMedium;
    case 'low': return styles.badgeTextLow;
    default: return styles.badgeTextInfo;
  }
}

function getSeverityBannerStyle(severity: string) {
  switch (severity.toLowerCase()) {
    case 'critical': return styles.findingsSeverityBannerCritical;
    case 'high': return styles.findingsSeverityBannerHigh;
    case 'medium': return styles.findingsSeverityBannerMedium;
    case 'low': return styles.findingsSeverityBannerLow;
    default: return styles.findingsSeverityBannerInfo;
  }
}

function totalFindings(data: ReportData) {
  return data.findings.reduce(
    (acc, f) => {
      const sev = f.severity.toLowerCase();
      if (sev === 'critical') acc.critical++;
      else if (sev === 'high') acc.high++;
      else if (sev === 'medium') acc.medium++;
      else if (sev === 'low') acc.low++;
      else acc.info++;
      return acc;
    },
    { critical: 0, high: 0, medium: 0, low: 0, info: 0 }
  );
}

function formatStatus(status: string): string {
  return status
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function PageFooter({ date }: { date: string }) {
  return (
    <View style={styles.footer} fixed>
      <Text
        style={styles.footerLeft}
        render={({ pageNumber, totalPages }) =>
          `Page ${pageNumber} of ${totalPages}`
        }
      />
      <Text style={styles.footerCenter}>CONFIDENTIAL</Text>
      <Text style={styles.footerRight}>Generated: {formatDate(date)}</Text>
    </View>
  );
}

function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {subtitle ? <Text style={styles.sectionSubtitle}>{subtitle}</Text> : null}
    </View>
  );
}

function SeverityBadge({ severity }: { severity: string }) {
  return (
    <View style={[styles.badge, getSeverityBadgeStyle(severity)]}>
      <Text style={getSeverityTextStyle(severity)}>
        {severity.toUpperCase()}
      </Text>
    </View>
  );
}

function StatusBadge({ status }: { status: string }) {
  return (
    <View style={[styles.badge, styles.badgeStatus]}>
      <Text style={styles.badgeStatusText}>{formatStatus(status)}</Text>
    </View>
  );
}

function ScannerBadge({ scanner }: { scanner: string }) {
  return (
    <View style={[styles.badge, styles.badgeScanner]}>
      <Text style={styles.badgeScannerText}>{scanner}</Text>
    </View>
  );
}

function ScanTypeBadge({ scanType }: { scanType: string }) {
  return (
    <View style={[styles.badge, styles.badgeScanType]}>
      <Text style={styles.badgeScanTypeText}>{scanType}</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Cover Page
// ---------------------------------------------------------------------------

function CoverPage({ data }: { data: ReportData }) {
  return (
    <Page size="A4" style={styles.coverPage}>
      {/* Top navigation bar */}
      <View style={styles.coverTopBar}>
        <Text style={styles.coverTopBarTitle}>INFRASHIELD DASHBOARD</Text>
        <Text style={styles.coverTopBarDate}>
          {formatDateTime(data.reportGeneratedAt)}
        </Text>
      </View>

      {/* Yellow accent stripe */}
      <View style={styles.coverAccentStripe} />

      {/* Hero content */}
      <View style={styles.coverHero}>
        <Text style={styles.coverEyebrow}>Security Assessment</Text>
        <Text style={styles.coverTitle}>Security Scan{'\n'}Report</Text>
        <Text style={styles.coverSubtitle}>{data.appName}</Text>

        {/* Meta boxes row 1 */}
        <View style={styles.coverMetaRow}>
          <View style={styles.coverMetaBox}>
            <Text style={styles.coverMetaLabel}>Image Tag</Text>
            <Text style={styles.coverMetaValue}>{data.imageTag}</Text>
          </View>
          <View style={styles.coverMetaBox}>
            <Text style={styles.coverMetaLabel}>Scan Date</Text>
            <Text style={styles.coverMetaValue}>{formatDate(data.scanDate)}</Text>
          </View>
        </View>

        {/* Meta boxes row 2 */}
        <View style={styles.coverMetaRow}>
          {data.imageDigest ? (
            <View style={styles.coverMetaBox}>
              <Text style={styles.coverMetaLabel}>Image Digest</Text>
              <Text style={[styles.coverMetaValue, { fontSize: 8 }]}>
                {data.imageDigest}
              </Text>
            </View>
          ) : null}
          <View style={styles.coverMetaBox}>
            <Text style={styles.coverMetaLabel}>Risk Score</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 }}>
              <Text style={[styles.coverMetaValue, { fontSize: 20 }]}>
                {data.riskScore}
              </Text>
              <View style={getRiskBadgeStyle(data.riskScore)}>
                <Text style={styles.riskBadgeText}>
                  {getRiskLabel(data.riskScore)}
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* App description */}
        <View style={{ marginTop: 8, padding: 14, backgroundColor: COLORS.white, borderRadius: 6, borderWidth: 1, borderColor: COLORS.lightGray }}>
          <Text style={{ fontSize: 8, color: COLORS.midGray, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 1 }}>
            Application
          </Text>
          <Text style={{ fontSize: 10, fontFamily: 'Helvetica-Bold', color: COLORS.navy, marginBottom: 4 }}>
            {data.appName}
          </Text>
          <Text style={{ fontSize: 9, color: COLORS.darkGray }}>
            {data.appDescription}
          </Text>
        </View>
      </View>

      {/* Bottom bar */}
      <View style={styles.coverBottomBar}>
        <Text style={styles.coverConfidential}>
          CONFIDENTIAL — INTERNAL USE ONLY
        </Text>
        <Text style={styles.coverOrgText}>Maybank Indonesia · Digital Infrastructure</Text>
      </View>
    </Page>
  );
}

// ---------------------------------------------------------------------------
// Executive Summary Page
// ---------------------------------------------------------------------------

function ExecutiveSummaryPage({ data }: { data: ReportData }) {
  const totals = totalFindings(data);

  return (
    <Page size="A4" style={styles.page}>
      <View style={styles.pageContent}>
        <SectionHeader
          title="Executive Summary"
          subtitle={`Report generated on ${formatDateTime(data.reportGeneratedAt)}`}
        />

        {/* App information table */}
        <Text style={[styles.mb8, { fontSize: 9, fontFamily: 'Helvetica-Bold', color: COLORS.darkGray, textTransform: 'uppercase', letterSpacing: 0.5 }]}>
          Application Information
        </Text>
        <View style={styles.infoTable}>
          <View style={styles.infoTableRow}>
            <Text style={styles.infoTableLabel}>Application Name</Text>
            <Text style={styles.infoTableValue}>{data.appName}</Text>
          </View>
          <View style={styles.infoTableRowAlt}>
            <Text style={styles.infoTableLabel}>Description</Text>
            <Text style={styles.infoTableValue}>{data.appDescription}</Text>
          </View>
          <View style={styles.infoTableRow}>
            <Text style={styles.infoTableLabel}>Image Tag</Text>
            <Text style={styles.infoTableValue}>{data.imageTag}</Text>
          </View>
          {data.imageDigest ? (
            <View style={styles.infoTableRowAlt}>
              <Text style={styles.infoTableLabel}>Image Digest</Text>
              <Text style={styles.infoTableValue}>{data.imageDigest}</Text>
            </View>
          ) : null}
          <View style={styles.infoTableRow}>
            <Text style={styles.infoTableLabel}>Scan Date</Text>
            <Text style={styles.infoTableValue}>{formatDateTime(data.scanDate)}</Text>
          </View>
          <View style={styles.infoTableRowAltLast}>
            <Text style={styles.infoTableLabel}>Risk Score</Text>
            <Text style={[styles.infoTableValue, { fontFamily: 'Helvetica-Bold', color: data.riskScore >= 75 ? COLORS.critical : data.riskScore >= 50 ? COLORS.high : data.riskScore >= 25 ? COLORS.mediumText : COLORS.green }]}>
              {data.riskScore} / 100 — {getRiskLabel(data.riskScore)}
            </Text>
          </View>
        </View>

        {/* Findings summary boxes */}
        <Text style={[styles.mb8, { fontSize: 9, fontFamily: 'Helvetica-Bold', color: COLORS.darkGray, textTransform: 'uppercase', letterSpacing: 0.5 }]}>
          Findings Summary
        </Text>
        <View style={styles.summaryBoxRow}>
          <View style={[styles.summaryBox, styles.summaryBoxCritical]}>
            <Text style={styles.summaryBoxCount}>{totals.critical}</Text>
            <Text style={styles.summaryBoxLabel}>Critical</Text>
          </View>
          <View style={[styles.summaryBox, styles.summaryBoxHigh]}>
            <Text style={styles.summaryBoxCount}>{totals.high}</Text>
            <Text style={styles.summaryBoxLabel}>High</Text>
          </View>
          <View style={[styles.summaryBox, styles.summaryBoxMedium]}>
            <Text style={styles.summaryBoxCount}>{totals.medium}</Text>
            <Text style={styles.summaryBoxLabel}>Medium</Text>
          </View>
          <View style={[styles.summaryBox, styles.summaryBoxLow]}>
            <Text style={styles.summaryBoxCount}>{totals.low}</Text>
            <Text style={styles.summaryBoxLabel}>Low</Text>
          </View>
          <View style={[styles.summaryBox, styles.summaryBoxInfo]}>
            <Text style={styles.summaryBoxCount}>{totals.info}</Text>
            <Text style={styles.summaryBoxLabel}>Info</Text>
          </View>
        </View>

        {/* Scanners used table */}
        <Text style={[styles.mb8, { fontSize: 9, fontFamily: 'Helvetica-Bold', color: COLORS.darkGray, textTransform: 'uppercase', letterSpacing: 0.5 }]}>
          Scanners Used
        </Text>
        <View style={styles.scannerTable}>
          <View style={styles.scannerTableHeaderRow}>
            <Text style={styles.scannerTableHeaderCell}>Scanner</Text>
            <Text style={styles.scannerTableHeaderCell}>Type</Text>
            <Text style={[styles.scannerTableHeaderCell, { flex: 1.2 }]}>Scanned At</Text>
            <Text style={styles.scannerTableHeaderCellNarrow}>C</Text>
            <Text style={styles.scannerTableHeaderCellNarrow}>H</Text>
            <Text style={styles.scannerTableHeaderCellNarrow}>M</Text>
            <Text style={styles.scannerTableHeaderCellNarrow}>L</Text>
          </View>
          {data.scans.map((scan, idx) => (
            <View
              key={idx}
              style={idx % 2 === 0 ? styles.scannerTableRow : styles.scannerTableRowAlt}
            >
              <Text style={styles.scannerTableCell}>{scan.scanner}</Text>
              <Text style={styles.scannerTableCell}>{scan.scanType}</Text>
              <Text style={[styles.scannerTableCell, { flex: 1.2 }]}>
                {formatDateTime(scan.scannedAt)}
              </Text>
              <Text style={[styles.scannerTableCellNarrow, styles.scannerCellCritical]}>
                {scan.findings.critical}
              </Text>
              <Text style={[styles.scannerTableCellNarrow, styles.scannerCellHigh]}>
                {scan.findings.high}
              </Text>
              <Text style={[styles.scannerTableCellNarrow, styles.scannerCellMedium]}>
                {scan.findings.medium}
              </Text>
              <Text style={[styles.scannerTableCellNarrow, styles.scannerCellLow]}>
                {scan.findings.low}
              </Text>
            </View>
          ))}
        </View>
      </View>

      <PageFooter date={data.reportGeneratedAt} />
    </Page>
  );
}

// ---------------------------------------------------------------------------
// Individual Finding Block
// ---------------------------------------------------------------------------

function FindingBlock({
  finding,
  isLast,
}: {
  finding: ReportData['findings'][0];
  isLast: boolean;
}) {
  return (
    <View style={styles.findingBlock} wrap={false}>
      {/* Title */}
      <Text style={styles.findingTitle}>{finding.title}</Text>

      {/* Badge row */}
      <View style={styles.findingBadgeRow}>
        <SeverityBadge severity={finding.severity} />
        <StatusBadge status={finding.status} />
        <ScannerBadge scanner={finding.scanner} />
        <ScanTypeBadge scanType={finding.scanType} />
      </View>

      {/* Location */}
      {finding.filePath ? (
        <View style={styles.findingMetaRow}>
          <Text style={styles.findingMetaLabel}>Location</Text>
          <Text style={styles.findingMetaValueMono}>
            {finding.filePath}
            {finding.lineNumber ? ` : line ${finding.lineNumber}` : ''}
          </Text>
        </View>
      ) : null}

      {/* CWE */}
      {finding.cwe ? (
        <View style={styles.findingMetaRow}>
          <Text style={styles.findingMetaLabel}>CWE</Text>
          <Text style={styles.findingMetaValue}>{finding.cwe}</Text>
        </View>
      ) : null}

      {/* CVE */}
      {finding.cve ? (
        <View style={styles.findingMetaRow}>
          <Text style={styles.findingMetaLabel}>CVE</Text>
          <Text style={styles.findingMetaValue}>{finding.cve}</Text>
        </View>
      ) : null}

      {/* Date found */}
      <View style={[styles.findingMetaRow, { marginBottom: 10 }]}>
        <Text style={styles.findingMetaLabel}>Found At</Text>
        <Text style={styles.findingMetaValue}>{formatDateTime(finding.foundAt)}</Text>
      </View>

      {/* Description */}
      <View style={styles.findingDescriptionBox}>
        <Text style={styles.findingDescriptionLabel}>Description</Text>
        <Text style={styles.findingDescriptionText}>{finding.description}</Text>
      </View>

      {/* Remediation */}
      {finding.remediation ? (
        <View style={styles.findingRemediationBox}>
          <Text style={styles.findingRemediationLabel}>Remediation</Text>
          <Text style={styles.findingRemediationText}>{finding.remediation}</Text>
        </View>
      ) : null}

      {/* Divider (not on last item) */}
      {!isLast ? <View style={styles.findingDivider} /> : null}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Findings Detail Pages
// ---------------------------------------------------------------------------

function FindingsPages({ data }: { data: ReportData }) {
  // Group findings by severity in order
  const grouped = SEVERITY_ORDER.reduce<
    Record<string, ReportData['findings']>
  >((acc, sev) => {
    const items = data.findings.filter(
      (f) => f.severity.toLowerCase() === sev
    );
    if (items.length > 0) acc[sev] = items;
    return acc;
  }, {});

  const severities = Object.keys(grouped);

  if (severities.length === 0) {
    return (
      <Page size="A4" style={styles.page}>
        <View style={styles.pageContent}>
          <SectionHeader title="Findings Detail" />
          <Text style={{ fontSize: 10, color: COLORS.midGray, textAlign: 'center', marginTop: 60 }}>
            No findings were identified in this scan.
          </Text>
        </View>
        <PageFooter date={data.reportGeneratedAt} />
      </Page>
    );
  }

  return (
    <>
      {severities.map((sev) => {
        const findings = grouped[sev];
        return (
          <Page key={sev} size="A4" style={styles.page}>
            <View style={styles.pageContent}>
              {/* Severity group banner */}
              <View
                style={[
                  styles.findingsSeverityBanner,
                  getSeverityBannerStyle(sev),
                ]}
              >
                <Text style={styles.findingsSeverityBannerText}>
                  {sev.charAt(0).toUpperCase() + sev.slice(1)} Severity Findings
                </Text>
                <Text style={styles.findingsSeverityBannerCount}>
                  {findings.length} {findings.length === 1 ? 'finding' : 'findings'}
                </Text>
              </View>

              {/* Findings */}
              {findings.map((finding, idx) => (
                <FindingBlock
                  key={finding.id}
                  finding={finding}
                  isLast={idx === findings.length - 1}
                />
              ))}
            </View>
            <PageFooter date={data.reportGeneratedAt} />
          </Page>
        );
      })}
    </>
  );
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export function generateReportPDF(data: ReportData) {
  return (
    <Document
      title={`Security Scan Report — ${data.appName}`}
      author="InfraShield Dashboard"
      subject={`Security assessment for ${data.appName} ${data.imageTag}`}
      creator="InfraShield Security Dashboard"
      producer="@react-pdf/renderer"
    >
      {/* 1. Cover Page */}
      <CoverPage data={data} />

      {/* 2. Executive Summary */}
      <ExecutiveSummaryPage data={data} />

      {/* 3. Findings Detail Pages */}
      <FindingsPages data={data} />
    </Document>
  );
}
