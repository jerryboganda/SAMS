import React from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ArrowLeft } from "lucide-react";
import { Button, Card } from "../../components/ui";

export const NotFoundPage: React.FC = () => {
  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6 text-center">
      <Card className="max-w-md w-full p-8 border-slate-200 space-y-6">
        <div className="w-16 h-16 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center mx-auto">
          <AlertTriangle className="w-8 h-8" />
        </div>
        <div className="space-y-2">
          <h1 className="text-4xl font-extrabold text-[#0E2A47]">404</h1>
          <h2 className="text-xl font-bold text-[#0E2A47]">Page Not Found</h2>
          <p className="text-xs text-slate-500 leading-relaxed">
            The requested page does not exist or has been moved. Check the URL or return to the main portal.
          </p>
        </div>
        <Link to="/">
          <Button variant="teal" icon={<ArrowLeft className="w-4 h-4" />}>
            Back to Home Page
          </Button>
        </Link>
      </Card>
    </div>
  );
};
