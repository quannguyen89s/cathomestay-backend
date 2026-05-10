/**
 * Excel export utility for booking reports
 * Requires: npm install xlsx
 */

import type XLSX from "xlsx";
import type { IBooking } from "../models/Booking.js";

// We'll dynamically import XLSX to avoid errors if not installed
// For now, we'll use a workaround to generate Excel files

export interface ExportBookingData {
  "Booking ID": string;
  "Khách hàng": string;
  "Số điện thoại": string;
  "Check-in": string;
  "Check-out": string;
  "Thời lượng (h)": number;
  "Loại combo": string;
  "Số khách": number;
  "Giá gốc (₫)": number;
  "Phí khách thêm (₫)": number;
  "Giá cuối (₫)": number;
  "Trạng thái": string;
  "Tạo bởi": string;
  "Thời gian tạo": string;
  "Ghi chú admin": string;
}

/**
 * Format Vietnamese date as DD/MM/YYYY HH:mm
 */
export const formatDateTimeVN = (date: Date | string): string => {
  const d = typeof date === "string" ? new Date(date) : date;
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  const hours = String(d.getHours()).padStart(2, "0");
  const minutes = String(d.getMinutes()).padStart(2, "0");
  return `${day}/${month}/${year} ${hours}:${minutes}`;
};

/**
 * Generate Excel file from bookings data
 */
export const generateBookingExcel = async (
  bookings: any[],
  homestayTitle: string,
): Promise<Buffer> => {
  // Dynamically import XLSX
  const XLSX = await import("xlsx");

  // Prepare data for Excel
  const data: ExportBookingData[] = bookings.map((booking) => {
    const userObj = typeof booking.userId === "object" ? booking.userId : null;
    const createdByObj =
      typeof booking.createdBy === "object" ? booking.createdBy : null;

    const checkIn = new Date(booking.checkIn);
    const checkOut = new Date(booking.checkOut);
    const hours =
      booking.hours ||
      Math.ceil((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60));

    return {
      "Booking ID": booking._id.toString(),
      "Khách hàng":
        booking.customerInfo?.name || userObj?.name || "Khách ẩn danh",
      "Số điện thoại": booking.customerInfo?.phone || userObj?.phone || "—",
      "Check-in": formatDateTimeVN(booking.checkIn),
      "Check-out": formatDateTimeVN(booking.checkOut),
      "Thời lượng (h)": hours,
      "Loại combo": booking.comboType || "N/A",
      "Số khách": booking.guests,
      "Giá gốc (₫)": Math.round(booking.originalPrice || 0),
      "Phí khách thêm (₫)": Math.round(booking.extraGuestFee || 0),
      "Giá cuối (₫)": Math.round(booking.finalPrice || 0),
      "Trạng thái": booking.status,
      "Tạo bởi": createdByObj?.name || (booking.createdBy ? "Admin" : "Khách"),
      "Thời gian tạo": formatDateTimeVN(booking.createdAt),
      "Ghi chú admin": booking.adminNote || "—",
    };
  });

  // Create workbook
  const ws = XLSX.utils.json_to_sheet(data, {
    header: [
      "Booking ID",
      "Khách hàng",
      "Số điện thoại",
      "Check-in",
      "Check-out",
      "Thời lượng (h)",
      "Loại combo",
      "Số khách",
      "Giá gốc (₫)",
      "Phí khách thêm (₫)",
      "Giá cuối (₫)",
      "Trạng thái",
      "Tạo bởi",
      "Thời gian tạo",
      "Ghi chú admin",
    ],
  });

  // Set column widths
  const colWidths = [
    { wch: 15 }, // Booking ID
    { wch: 20 }, // Khách hàng
    { wch: 15 }, // Số điện thoại
    { wch: 20 }, // Check-in
    { wch: 20 }, // Check-out
    { wch: 12 }, // Thời lượng
    { wch: 15 }, // Loại combo
    { wch: 10 }, // Số khách
    { wch: 15 }, // Giá gốc
    { wch: 15 }, // Phí khách thêm
    { wch: 15 }, // Giá cuối
    { wch: 12 }, // Trạng thái
    { wch: 15 }, // Tạo bởi
    { wch: 20 }, // Thời gian tạo
    { wch: 25 }, // Ghi chú admin
  ];

  ws["!cols"] = colWidths;

  // Format header row
  const headerStyle = {
    fill: { fgColor: { rgb: "FF4472C4" } },
    font: { color: { rgb: "FFFFFFFF" }, bold: true },
    alignment: { horizontal: "center", vertical: "center", wrapText: true },
  };

  for (
    let i = 0;
    i < (data.length > 0 ? Object.keys(data[0]).length : 0);
    i++
  ) {
    const cellRef = XLSX.utils.encode_cell({ r: 0, c: i });
    if (!ws[cellRef]) continue;
    ws[cellRef].s = headerStyle;
  }

  // Add summary row at the bottom
  const summaryRow = data.length + 2;
  const totalRevenue = data.reduce((sum, row) => sum + row["Giá cuối (₫)"], 0);
  const totalBookings = data.length;

  ws[XLSX.utils.encode_cell({ r: summaryRow, c: 0 })] = {
    v: "TỔNG CỘNG",
    t: "s",
    s: { font: { bold: true }, alignment: { horizontal: "right" } },
  };

  ws[XLSX.utils.encode_cell({ r: summaryRow, c: 10 })] = {
    v: totalRevenue,
    t: "n",
    s: { font: { bold: true } },
  };

  ws[XLSX.utils.encode_cell({ r: summaryRow, c: 1 })] = {
    v: `${totalBookings} booking(s)`,
    t: "s",
    s: { font: { bold: true } },
  };

  // Create workbook and add sheet
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, `Homestay Booking Report`);

  // Set title and metadata
  wb.Props = {
    Title: `${homestayTitle} - Homestay Booking Report`,
    Subject: "Booking Report",
    Author: "Homestay Management System",
    CreatedDate: new Date(),
  };

  // Generate buffer
  return XLSX.write(wb, { bookType: "xlsx", type: "buffer" }) as Buffer;
};
