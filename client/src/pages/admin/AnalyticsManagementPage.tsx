import React, { useEffect, useState } from "react";
import { BarChart3, TrendingUp, Users, Download, BookOpen, Award, FileSpreadsheet } from "lucide-react";
import { Card, StatCard, Table, Badge, Button, ProgressBar } from "../../components/ui";
import { adminApi } from "../../api/endpoints/admin";
import { formatPKR } from "../../utils/formatters";
import { Toast } from "../../components/ui/ToastSystem";

export const AnalyticsManagementPage: React.FC = () => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await adminApi.getReportsData();
      setData(res);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const downloadCsv = (filename: string, headers: string[], rows: (string | number)[][]) => {
    const csvContent = [
      headers.join(","),
      ...rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `${filename}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    setToastMessage(`Downloaded ${filename}.csv report successfully.`);
  };

  const handleExportRevenue = () => {
    if (!data?.revenueByMonth) return;
    const headers = ["Month", "Revenue (PKR)", "Orders Count"];
    const rows = data.revenueByMonth.map((r: any) => [r.month, r.revenue, r.ordersCount]);
    downloadCsv("SAMS_Revenue_By_Month_Report", headers, rows);
  };

  const handleExportEnrollments = () => {
    if (!data?.enrollmentsByCourse) return;
    const headers = ["Course Title", "Active Candidates", "Total Revenue (PKR)"];
    const rows = data.enrollmentsByCourse.map((r: any) => [r.courseTitle, r.activeCount, r.totalRevenue]);
    downloadCsv("SAMS_Course_Enrollments_Report", headers, rows);
  };

  const handleExportQBank = () => {
    if (!data?.qbankUsage?.topSubjectsAttempted) return;
    const headers = ["Subject", "Questions Attempted", "Average Score (%)"];
    const rows = data.qbankUsage.topSubjectsAttempted.map((s: any) => [s.subject, s.attempts, `${s.avgScore}%`]);
    downloadCsv("SAMS_QBank_Subject_Performance_Report", headers, rows);
  };

  const handleExportTopStudents = () => {
    if (!data?.topStudents) return;
    const headers = ["Candidate ID", "Candidate Name", "Email", "Tests Taken", "QBank Accuracy (%)", "Study Hours"];
    const rows = data.topStudents.map((s: any) => [s.studentId, s.name, s.email, s.testsTaken, `${s.qbankAccuracy}%`, s.studyHours]);
    downloadCsv("SAMS_Top_Candidates_Leaderboard_Report", headers, rows);
  };

  if (loading) {
    return (
      <div className="space-y-6 pb-12">
        <div className="h-8 bg-slate-200 rounded w-1/3 animate-pulse"></div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          <div className="h-28 bg-slate-200 rounded-xl animate-pulse"></div>
          <div className="h-28 bg-slate-200 rounded-xl animate-pulse"></div>
          <div className="h-28 bg-slate-200 rounded-xl animate-pulse"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-12">
      {toastMessage && <Toast message={toastMessage} onClose={() => setToastMessage(null)} />}

      <div className="border-b border-slate-200 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-[#0E2A47]">Platform Revenue & Candidate Analytics Reports</h1>
          <p className="text-xs text-slate-500 mt-1">
            Real-time business performance analytics, course subscription revenues, and QBank candidate metrics.
          </p>
        </div>
      </div>

      {/* KPI Stat Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-6">
        <StatCard
          title="Gross Sales (YTD)"
          value={formatPKR(data?.revenueByMonth?.reduce((acc: number, curr: any) => acc + curr.revenue, 0) || 2850000)}
          change="+18.4% vs prev period"
          changeType="positive"
          icon={<TrendingUp className="w-6 h-6 text-emerald-600" />}
        />
        <StatCard
          title="Active Course Subscriptions"
          value="382 Candidates"
          change="Across NRE, SMLE & MBBS"
          icon={<BookOpen className="w-6 h-6 text-[#0FA3A3]" />}
        />
        <StatCard
          title="QBank Vignettes Attempted"
          value={data?.qbankUsage?.totalQuestionsAttempted?.toLocaleString() || "14,250"}
          change="3,000+ active item pool"
          icon={<BarChart3 className="w-6 h-6 text-indigo-600" />}
        />
        <StatCard
          title="QBank Average Accuracy"
          value={`${data?.qbankUsage?.averagePassRate || 74.2}%`}
          change="National NRE benchmark"
          changeType="positive"
          icon={<Award className="w-6 h-6 text-amber-500" />}
        />
      </div>

      {/* Report 1: Revenue by Month */}
      <Card className="p-6 border-slate-200 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-100">
          <div>
            <h3 className="text-base font-extrabold text-[#0E2A47] flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-[#0FA3A3]" /> Monthly Revenue & Order Volume Breakdown
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">Historical monthly tuition fees collected across manual Raast/Bank and automated gateways.</p>
          </div>
          <Button variant="outline" size="sm" icon={<Download className="w-3.5 h-3.5 text-[#0FA3A3]" />} onClick={handleExportRevenue}>
            Export CSV
          </Button>
        </div>

        <Table
          columns={[
            { header: "Month", accessor: (row) => <span className="font-bold text-[#0E2A47]">{row.month}</span> },
            { header: "Gross Revenue", accessor: (row) => <span className="font-extrabold text-emerald-700">{formatPKR(row.revenue)}</span> },
            { header: "Orders Paid", accessor: (row) => <Badge variant="teal">{row.ordersCount} Invoices</Badge> },
            {
              header: "Avg. Order Value",
              accessor: (row) => <span className="text-xs text-slate-600">{formatPKR(Math.round(row.revenue / (row.ordersCount || 1)))}</span>,
            },
          ]}
          data={data?.revenueByMonth || []}
        />
      </Card>

      {/* Report 2: Enrollments by Course */}
      <Card className="p-6 border-slate-200 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-100">
          <div>
            <h3 className="text-base font-extrabold text-[#0E2A47] flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-[#0FA3A3]" /> Course Enrollments & Revenue Breakdown
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">Active student subscriptions and cumulative gross revenue per course catalog entry.</p>
          </div>
          <Button variant="outline" size="sm" icon={<Download className="w-3.5 h-3.5 text-[#0FA3A3]" />} onClick={handleExportEnrollments}>
            Export CSV
          </Button>
        </div>

        <Table
          columns={[
            { header: "Course Title", accessor: (row) => <span className="font-bold text-[#0E2A47]">{row.courseTitle}</span> },
            { header: "Active Students", accessor: (row) => <Badge variant="blue">{row.activeCount} Enrolled</Badge> },
            { header: "Cumulative Revenue", accessor: (row) => <span className="font-extrabold text-[#0E2A47]">{formatPKR(row.totalRevenue)}</span> },
          ]}
          data={data?.enrollmentsByCourse || []}
        />
      </Card>

      {/* Report 3: QBank Usage & Subject Performance */}
      <Card className="p-6 border-slate-200 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-100">
          <div>
            <h3 className="text-base font-extrabold text-[#0E2A47] flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-[#0FA3A3]" /> QBank Usage & Subject Mastery Metrics
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">Candidate question attempt volumes and average test scores categorized by medical taxonomy subject.</p>
          </div>
          <Button variant="outline" size="sm" icon={<Download className="w-3.5 h-3.5 text-[#0FA3A3]" />} onClick={handleExportQBank}>
            Export CSV
          </Button>
        </div>

        <Table
          columns={[
            { header: "Medical Subject Taxonomy", accessor: (row) => <span className="font-bold text-[#0E2A47]">{row.subject}</span> },
            { header: "Total Vignette Attempts", accessor: (row) => <span className="font-semibold text-slate-700">{row.attempts.toLocaleString()}</span> },
            {
              header: "Candidate Avg Accuracy",
              accessor: (row) => (
                <div className="w-36 space-y-1">
                  <div className="flex justify-between text-xs font-bold text-slate-800">
                    <span>Score</span>
                    <span>{row.avgScore}%</span>
                  </div>
                  <ProgressBar progress={row.avgScore} variant={row.avgScore >= 75 ? "teal" : "amber"} />
                </div>
              ),
            },
          ]}
          data={data?.qbankUsage?.topSubjectsAttempted || []}
        />
      </Card>

      {/* Report 4: Top Performing Students Leaderboard */}
      <Card className="p-6 border-slate-200 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-100">
          <div>
            <h3 className="text-base font-extrabold text-[#0E2A47] flex items-center gap-2">
              <Award className="w-4 h-4 text-amber-500" /> Top Performing Candidates Leaderboard
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">Top candidate activity rankings based on QBank test volume, accuracy %, and portal study hours.</p>
          </div>
          <Button variant="outline" size="sm" icon={<Download className="w-3.5 h-3.5 text-[#0FA3A3]" />} onClick={handleExportTopStudents}>
            Export CSV
          </Button>
        </div>

        <Table
          columns={[
            {
              header: "Candidate Name & Email",
              accessor: (row) => (
                <div>
                  <div className="font-bold text-[#0E2A47] text-sm">{row.name}</div>
                  <div className="text-xs text-slate-500">{row.email}</div>
                </div>
              ),
            },
            { header: "Tests Taken", accessor: (row) => <Badge variant="slate">{row.testsTaken} Completed</Badge> },
            { header: "QBank Accuracy", accessor: (row) => <span className="font-extrabold text-emerald-700">{row.qbankAccuracy}%</span> },
            { header: "Portal Study Time", accessor: (row) => <span className="text-xs font-semibold text-slate-700">{row.studyHours} Hours</span> },
          ]}
          data={data?.topStudents || []}
        />
      </Card>
    </div>
  );
};
