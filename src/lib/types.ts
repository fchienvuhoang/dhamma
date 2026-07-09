export interface Category {
  id: string;
  name: string;
  keywords: string[];
}

export interface ParsedRecord {
  soThamChieu: string;
  ngayGioGiaoDich: string;
  loaiGiaoDich: string;
  nganHang: string;
  soTaiKhoan: string;
  tenChuTaiKhoan: string;
  chiTietGiaoDich: string;
  tienRa: string | number;
  tienVao: string | number;
  ghiChu: string;

  searchText: string;
  matchedCategoryId?: string;
  isFooter?: boolean;
}
