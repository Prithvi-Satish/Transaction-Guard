import { AGENT_LABELS, AGENT_ORDER } from "./agents";
import { jsPDF } from "jspdf";
import { CaseRecord } from "./types";

const fileSafeTimestamp = (isoDate: string): string => isoDate.replace(/[:.]/g, "-");

const triggerDownload = (fileName: string, content: string, mimeType: string): void => {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
};

export const downloadReportJson = (record: CaseRecord): void => {
  const fileName = `${record.caseId}-${fileSafeTimestamp(record.createdAt)}.json`;
  triggerDownload(fileName, JSON.stringify(record, null, 2), "application/json;charset=utf-8");
};

export const downloadReportMarkdown = (record: CaseRecord): void => {
  const heading = `# Investigation Report - ${record.caseId}`;
  const meta = [
    `- Created: ${new Date(record.createdAt).toLocaleString()}`,
    `- Customer: ${record.transaction.customerName}`,
    `- Account: ${record.transaction.accountId}`,
    `- Amount: ${record.transaction.currency} ${record.transaction.amount.toLocaleString()}`,
    `- Verdict: ${record.finalVerdict}`
  ].join("\n");

  const orchestratorSection = [
    "## Orchestrator Agent",
    "Coordinates the complete pipeline, calls each specialist agent in sequence, and merges results into a case decision package."
  ].join("\n");

  const sections = AGENT_ORDER.map((agent) => {
    const analysis = record.analyses[agent];
    return [
      `## ${AGENT_LABELS[agent]}`,
      analysis.summary,
      `- Score: ${analysis.score}/100`,
      `- Recommendation: ${analysis.recommendation}`,
      "- Highlights:",
      ...analysis.highlights.map((item) => `  - ${item}`)
    ].join("\n");
  }).join("\n\n");

  const markdown = [heading, "", meta, "", orchestratorSection, "", sections].join("\n");
  const fileName = `${record.caseId}-${fileSafeTimestamp(record.createdAt)}.md`;
  triggerDownload(fileName, markdown, "text/markdown;charset=utf-8");
};

export const downloadReportPdf = (record: CaseRecord): void => {
  const pdf = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 44;
  const maxWidth = pageWidth - margin * 2;
  let y = margin;

  const addLine = (text: string, size = 11, gap = 16) => {
    pdf.setFontSize(size);
    const lines = pdf.splitTextToSize(text, maxWidth) as string[];

    lines.forEach((line) => {
      if (y > pageHeight - margin) {
        pdf.addPage();
        y = margin;
      }
      pdf.text(line, margin, y);
      y += gap;
    });
  };

  addLine(`Investigation Report - ${record.caseId}`, 17, 22);
  addLine(`Created: ${new Date(record.createdAt).toLocaleString()}`);
  addLine(`Customer: ${record.transaction.customerName}`);
  addLine(`Account: ${record.transaction.accountId}`);
  addLine(`Amount: ${record.transaction.currency} ${record.transaction.amount.toLocaleString()}`);
  addLine(`Verdict: ${record.finalVerdict}`);

  y += 8;
  addLine("Orchestrator Agent", 13, 18);
  addLine("Coordinates execution order, context passing, and final result collation across specialist agents.");

  AGENT_ORDER.forEach((agent) => {
    const analysis = record.analyses[agent];
    y += 10;
    addLine(AGENT_LABELS[agent], 13, 18);
    addLine(analysis.summary);
    addLine(`Score: ${analysis.score}/100`);
    addLine(`Recommendation: ${analysis.recommendation}`);
    addLine("Highlights:");
    analysis.highlights.forEach((item) => addLine(`- ${item}`));
  });

  const fileName = `${record.caseId}-${fileSafeTimestamp(record.createdAt)}.pdf`;
  pdf.save(fileName);
};
