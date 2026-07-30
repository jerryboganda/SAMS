import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Upload,
  Download,
  AlertTriangle,
  CheckCircle2,
  FileSpreadsheet,
  ArrowRight,
  ArrowLeft,
  XCircle,
  Sparkles,
} from "lucide-react";
import { Card, Button, Table, Badge, Toast } from "../../components/ui";
import { adminApi } from "../../api/endpoints/admin";

// Sample bad CSV data for easy demoing of error states
const SAMPLE_BAD_CSV_TEXT = `stem,optionA,optionB,optionC,optionD,correctOption,subjectName,difficulty,explanation
A 50yo male presents with severe chest pain radiating to left arm.,Aspirin,Metoprolol,Nitroglycerin,Morphine,A,Anatomy,medium,Initial management for ACS involves antiplatelet therapy.
Bad row short stem,Opt A,Opt B,Opt C,Opt D,A,Anatomy,easy,Stem is too short.
A 30yo female with dyspnea and fever.,Ceftriaxone,Azithromycin,Amoxicillin,Vancomycin,,Pathology,medium,Missing correct option marker.
Patient with cardiac murmur.,Echo,ECG,Xray,CT,A,Quantum Physics,hard,Unknown subject not in active taxonomy.
A 60yo diabetic patient with polyuria and polydipsia.,Metformin,Insulin,Glipizide,Empagliflozin,A,Medicine,easy,First-line therapy for type 2 diabetes.`;

export const QBankImportPage: React.FC = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [csvContent, setCsvContent] = useState("");
  const [fileName, setFileName] = useState("");
  const [isDryRunning, setIsDryRunning] = useState(false);
  const [dryRunResult, setDryRunResult] = useState<{
    validCount: number;
    errorCount: number;
    validRows: any[];
    errorRows: { rowNumber: number; snippet: string; reason: string }[];
  } | null>(null);
  const [isCommitting, setIsCommitting] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Step 1: Download Template CSV
  const handleDownloadTemplate = () => {
    const templateText = `stem,optionA,optionB,optionC,optionD,correctOption,subjectName,systemName,difficulty,explanation
"A 45-year-old male with retrosternal chest pain and ST elevations in II, III, aVF.","Aspirin + Heparin","Beta-blockers","Thrombolytics","Observation","A","Pathology","Cardiovascular System","medium","Inferior MI secondary to RCA occlusion."
"A 28-year-old female with Graves disease presenting with thyroid storm.","Methimazole + Propranolol","Levothyroxine","Radioactive Iodine","Surgery","A","Pharmacology","Endocrine System","hard","Thionamides inhibit thyroid hormone synthesis."`;

    const blob = new Blob([templateText], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "qbank_import_template.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // Step 1: Parse CSV helper
  const parseCsvText = (text: string) => {
    const lines = text.split("\n").filter((l) => l.trim().length > 0);
    if (lines.length < 2) return [];

    const headers = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
    const rows: any[] = [];

    for (let i = 1; i < lines.length; i++) {
      const currentline = lines[i].split(",");
      if (currentline.length < 2) continue;
      const obj: any = {};
      for (let j = 0; j < headers.length; j++) {
        obj[headers[j]] = currentline[j] ? currentline[j].trim().replace(/^"|"$/g, "") : "";
      }
      rows.push(obj);
    }
    return rows;
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (evt) => {
      const content = evt.target?.result as string;
      setCsvContent(content);
    };
    reader.readAsText(file);
  };

  const handleLoadSampleBadCsv = () => {
    setCsvContent(SAMPLE_BAD_CSV_TEXT);
    setFileName("sample_qbank_batch_with_errors.csv");
    setToastMessage("Loaded sample batch containing both valid and invalid rows.");
  };

  // Run Dry-Run Validation
  const handleRunDryRun = async () => {
    if (!csvContent) {
      alert("Please upload or load a CSV file first.");
      return;
    }
    setIsDryRunning(true);
    try {
      const parsedRows = parseCsvText(csvContent);
      const res = await adminApi.dryRunCsvImport(parsedRows);
      setDryRunResult(res);
      setStep(2);
    } catch (err) {
      console.error(err);
    } finally {
      setIsDryRunning(false);
    }
  };

  // Step 3: Commit Valid Rows
  const handleCommitImport = async () => {
    if (!dryRunResult || dryRunResult.validRows.length === 0) return;
    setIsCommitting(true);
    try {
      await adminApi.commitCsvImport(dryRunResult.validRows);
      setStep(3);
      setToastMessage(`Import successful! ${dryRunResult.validRows.length} questions committed to QBank.`);
    } catch (err) {
      console.error(err);
    } finally {
      setIsCommitting(false);
    }
  };

  return (
    <div className="space-y-8 pb-12 max-w-5xl mx-auto">
      {toastMessage && <Toast message={toastMessage} onClose={() => setToastMessage(null)} />}

      {/* Header */}
      <div className="border-b border-slate-200 pb-4 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link to="/admin/qbank" className="text-xs font-bold text-[#0FA3A3] hover:underline flex items-center gap-1">
              <ArrowLeft className="w-3.5 h-3.5" /> Back to QBank
            </Link>
          </div>
          <h1 className="text-2xl font-extrabold text-[#0E2A47]">3-Step CSV Batch Import Wizard</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Bulk import clinical vignettes, option distractors, and explanations with automatic dry-run error checking.
          </p>
        </div>
      </div>

      {/* Wizard Progress Steps */}
      <div className="grid grid-cols-3 gap-4">
        <div
          className={`p-4 rounded-xl border flex items-center gap-3 transition-all ${
            step === 1
              ? "bg-[#0E2A47] text-white border-[#0E2A47] shadow-sm"
              : step > 1
              ? "bg-emerald-50 border-emerald-200 text-emerald-900"
              : "bg-white border-slate-200 text-slate-400"
          }`}
        >
          <div
            className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs shrink-0 ${
              step === 1 ? "bg-amber-400 text-slate-950" : step > 1 ? "bg-emerald-600 text-white" : "bg-slate-200"
            }`}
          >
            1
          </div>
          <div>
            <p className="text-xs font-bold">Step 1: Upload & Format</p>
            <p className="text-[10px] opacity-80">Select CSV template</p>
          </div>
        </div>

        <div
          className={`p-4 rounded-xl border flex items-center gap-3 transition-all ${
            step === 2
              ? "bg-[#0E2A47] text-white border-[#0E2A47] shadow-sm"
              : step > 2
              ? "bg-emerald-50 border-emerald-200 text-emerald-900"
              : "bg-white border-slate-200 text-slate-400"
          }`}
        >
          <div
            className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs shrink-0 ${
              step === 2 ? "bg-amber-400 text-slate-950" : step > 2 ? "bg-emerald-600 text-white" : "bg-slate-200"
            }`}
          >
            2
          </div>
          <div>
            <p className="text-xs font-bold">Step 2: DRY-RUN Check</p>
            <p className="text-[10px] opacity-80">Review error reports</p>
          </div>
        </div>

        <div
          className={`p-4 rounded-xl border flex items-center gap-3 transition-all ${
            step === 3
              ? "bg-[#0E2A47] text-white border-[#0E2A47] shadow-sm"
              : "bg-white border-slate-200 text-slate-400"
          }`}
        >
          <div
            className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs shrink-0 ${
              step === 3 ? "bg-amber-400 text-slate-950" : "bg-slate-200"
            }`}
          >
            3
          </div>
          <div>
            <p className="text-xs font-bold">Step 3: Commit & Finish</p>
            <p className="text-[10px] opacity-80">Write to QBank database</p>
          </div>
        </div>
      </div>

      {/* STEP 1 CONTENT */}
      {step === 1 && (
        <Card className="p-6 border-slate-200 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 bg-slate-50 border border-slate-200 rounded-xl">
            <div>
              <p className="text-sm font-bold text-[#0E2A47]">Need a correctly formatted CSV template?</p>
              <p className="text-xs text-slate-500">
                Download the official template matching SAMS taxonomy columns (stem, optionA..D, correctOption, subjectName).
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              icon={<Download className="w-4 h-4 text-[#0FA3A3]" />}
              onClick={handleDownloadTemplate}
            >
              Download Template CSV
            </Button>
          </div>

          {/* Upload Box */}
          <div className="border-2 border-dashed border-slate-300 rounded-2xl p-8 text-center space-y-4 hover:border-[#0FA3A3] transition-colors bg-white">
            <FileSpreadsheet className="w-12 h-12 text-[#0FA3A3] mx-auto" />
            <div>
              <p className="text-sm font-bold text-slate-800">
                {fileName ? `Loaded: ${fileName}` : "Drag and drop your CSV file here or click to browse"}
              </p>
              <p className="text-xs text-slate-400 mt-1">Accepts .csv files up to 10MB</p>
            </div>

            <div className="flex flex-wrap justify-center gap-3 pt-2">
              <label className="cursor-pointer">
                <input type="file" accept=".csv" onChange={handleFileUpload} className="hidden" />
                <span className="inline-flex items-center gap-2 px-4 py-2 bg-[#0E2A47] text-white text-xs font-bold rounded-xl hover:bg-slate-800 transition-colors">
                  <Upload className="w-4 h-4" /> Browse CSV File
                </span>
              </label>

              <button
                type="button"
                onClick={handleLoadSampleBadCsv}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-amber-50 text-amber-800 border border-amber-300 text-xs font-bold rounded-xl hover:bg-amber-100 transition-colors"
              >
                <Sparkles className="w-4 h-4 text-amber-600" /> Demo Sample Batch (Contains Error Rows)
              </button>
            </div>
          </div>

          {csvContent && (
            <div className="p-4 bg-slate-900 text-slate-200 rounded-xl font-mono text-xs overflow-x-auto max-h-40">
              <p className="text-slate-400 font-sans font-bold text-[11px] mb-2 uppercase">CSV File Preview:</p>
              <pre>{csvContent.slice(0, 400)}...</pre>
            </div>
          )}

          <div className="flex justify-end pt-4">
            <Button
              variant="teal"
              disabled={!csvContent}
              isLoading={isDryRunning}
              icon={<ArrowRight className="w-4 h-4" />}
              onClick={handleRunDryRun}
            >
              Run Dry-Run Validation
            </Button>
          </div>
        </Card>
      )}

      {/* STEP 2 CONTENT */}
      {step === 2 && dryRunResult && (
        <Card className="p-6 border-slate-200 space-y-6">
          {/* Summary Stats */}
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-emerald-800 uppercase tracking-wider">Valid Rows Ready</p>
                <p className="text-3xl font-extrabold text-emerald-900 mt-1">{dryRunResult.validCount} Rows</p>
              </div>
              <CheckCircle2 className="w-8 h-8 text-emerald-600" />
            </div>

            <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-rose-800 uppercase tracking-wider">Validation Errors</p>
                <p className="text-3xl font-extrabold text-rose-900 mt-1">{dryRunResult.errorCount} Rows</p>
              </div>
              <XCircle className="w-8 h-8 text-rose-600" />
            </div>
          </div>

          {/* Validation Error Reports Table */}
          {dryRunResult.errorRows.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
                <h3 className="text-sm font-bold text-[#0E2A47]">Per-Row Error Details (Will be skipped during import)</h3>
              </div>

              <div className="border border-rose-200 rounded-xl overflow-hidden bg-rose-50/50">
                <Table
                  columns={[
                    {
                      header: "Row #",
                      accessor: (r) => <span className="font-mono text-xs font-bold text-rose-900">Row {r.rowNumber}</span>,
                    },
                    {
                      header: "Snippet",
                      accessor: (r) => <span className="font-mono text-xs text-slate-700">{r.snippet}</span>,
                    },
                    {
                      header: "Validation Failure Reason",
                      accessor: (r) => (
                        <span className="text-xs font-bold text-rose-700 flex items-center gap-1">
                          <XCircle className="w-3.5 h-3.5 shrink-0" /> {r.reason}
                        </span>
                      ),
                    },
                  ]}
                  data={dryRunResult.errorRows}
                />
              </div>
            </div>
          )}

          <div className="flex items-center justify-between pt-4 border-t border-slate-200">
            <Button variant="outline" icon={<ArrowLeft className="w-4 h-4" />} onClick={() => setStep(1)}>
              Upload Different CSV
            </Button>

            <Button
              variant="teal"
              disabled={dryRunResult.validCount === 0}
              isLoading={isCommitting}
              onClick={handleCommitImport}
            >
              Commit {dryRunResult.validCount} Valid Questions to QBank
            </Button>
          </div>
        </Card>
      )}

      {/* STEP 3 CONTENT */}
      {step === 3 && (
        <Card className="p-8 border-slate-200 text-center space-y-6 bg-white">
          <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-10 h-10" />
          </div>

          <div className="space-y-2">
            <h2 className="text-2xl font-extrabold text-[#0E2A47]">Questions Successfully Committed!</h2>
            <p className="text-sm text-slate-600 max-w-md mx-auto">
              Your batch import has been processed. High-yield clinical vignettes are now live and indexed in the candidate QBank database.
            </p>
          </div>

          <div className="flex justify-center gap-3 pt-4">
            <Button variant="teal" onClick={() => navigate("/admin/qbank")}>
              View QBank Questions
            </Button>
            <Button variant="outline" onClick={() => setStep(1)}>
              Import Another Batch
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
};
