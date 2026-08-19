import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { adminApi } from "../../api/endpoints/admin";
import { CreateStudentPayload, UpdateStudentPayload } from "../../types";

function mockJsonResponse(body: unknown, status: number = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: "",
    json: async () => body,
  } as Response;
}

describe("Admin Student Management API & Handlers", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(global, "fetch");
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it("creates a new student with course allocations and credentials", async () => {
    const payload: CreateStudentPayload = {
      name: "Dr. Ayesha Test",
      email: `ayesha.test@example.com`,
      password: "StrongPassword123!",
      phone: "+92 300 9876543",
      status: "active",
      emailVerified: true,
      enrollments: [
        {
          courseId: 1,
          validityMode: "days",
          days: 60,
        },
      ],
      sendWelcomeEmail: true,
    };

    fetchSpy.mockResolvedValueOnce(
      mockJsonResponse({
        success: true,
        data: {
          id: 101,
          name: "Dr. Ayesha Test",
          email: "ayesha.test@example.com",
          role: "student",
          status: "active",
          emailVerifiedAt: "2026-08-19T00:00:00.000Z",
          activeDevicesCount: 0,
          createdAt: "2026-08-19T00:00:00.000Z",
        },
      }, 201)
    );

    const newStudent = await adminApi.createStudent(payload);
    expect(newStudent).toBeDefined();
    expect(newStudent.name).toBe("Dr. Ayesha Test");
    expect(newStudent.email).toBe(payload.email.toLowerCase());
    expect(newStudent.status).toBe("active");
    expect(newStudent.emailVerifiedAt).toBeDefined();
    expect(newStudent.activeDevicesCount).toBe(0);
  });

  it("updates an existing student profile", async () => {
    const updatePayload: UpdateStudentPayload = {
      name: "Updated Candidate Name",
      phone: "+92 321 0000000",
      status: "suspended",
    };

    fetchSpy.mockResolvedValueOnce(
      mockJsonResponse({
        success: true,
        data: {
          id: 101,
          name: "Updated Candidate Name",
          email: "ayesha.test@example.com",
          phone: "+92 321 0000000",
          role: "student",
          status: "suspended",
          activeDevicesCount: 0,
          createdAt: "2026-08-19T00:00:00.000Z",
        },
      }, 200)
    );

    const updated = await adminApi.updateStudent(101, updatePayload);
    expect(updated.id).toBe(101);
    expect(updated.name).toBe("Updated Candidate Name");
    expect(updated.phone).toBe("+92 321 0000000");
    expect(updated.status).toBe("suspended");
  });

  it("safely handles student deletion and anonymization", async () => {
    fetchSpy.mockResolvedValueOnce(
      mockJsonResponse({
        success: true,
        data: {
          success: true,
          message: "Student account deleted successfully.",
        },
      }, 200)
    );

    const deleteRes = await adminApi.deleteStudent(101);
    expect(deleteRes.success).toBe(true);
  });
});
