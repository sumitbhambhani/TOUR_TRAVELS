import React, { useState, useEffect, useCallback } from "react";
import { useLocation } from "react-router-dom";
import {
    Card, Row, Col, Statistic, Table, Select, DatePicker, Button, Tabs, Tag, message, Dropdown, Empty, Spin, Space
} from "antd";
import {
    ShoppingCartOutlined, TeamOutlined, DollarOutlined, CompassOutlined,
    DownloadOutlined, FileExcelOutlined, FilePdfOutlined, FileTextOutlined,
    FilterOutlined, ReloadOutlined, BarChartOutlined,
} from "@ant-design/icons";
import {
    LineChart, Line, BarChart, Bar, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Legend
} from "recharts";
import { apiClient } from "../../services/api";
import { endpoints } from "../../constant/ENDPOINTS";

const { RangePicker } = DatePicker;
const { Option } = Select;

// ─── Export Helpers ───────────────────────────────────────────────
const exportToCSV = (data, columns, filename) => {
    if (!data?.length) return message.warning("No data to export");
    const header = columns.map((c) => c.title).join(",");
    const rows = data.map((row) =>
        columns.map((c) => `"${String(row[c.dataIndex] || "").replace(/"/g, '""')}"`).join(",")
    );
    const csv = [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${filename}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
    message.success("CSV exported successfully");
};

const exportToExcel = async (data, columns, filename) => {
    if (!data?.length) return message.warning("No data to export");
    const XLSX = await import("xlsx");
    const headers = columns.map((c) => c.title);
    const rows = data.map((row) => columns.map((c) => row[c.dataIndex] || ""));
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Report");
    XLSX.writeFile(wb, `${filename}.xlsx`);
    message.success("Excel exported successfully");
};

const exportToPDF = async (data, columns, filename, title) => {
    if (!data?.length) return message.warning("No data to export");
    const { default: jsPDF } = await import("jspdf");
    const autoTable = (await import("jspdf-autotable")).default;
    const doc = new jsPDF({ orientation: "landscape" });

    doc.setFontSize(16);
    doc.text(title || filename, 14, 20);
    doc.setFontSize(10);
    doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 28);

    autoTable(doc, {
        startY: 34,
        head: [columns.map((c) => c.title)],
        body: data.map((row) => columns.map((c) => String(row[c.dataIndex] || ""))),
        styles: { fontSize: 8 },
        headStyles: { fillColor: [24, 144, 255] },
    });
    doc.save(`${filename}.pdf`);
    message.success("PDF exported successfully");
};

const getStatusColor = (status) => {
    const map = {
        CONFIRMED: "green", PENDING: "orange", CANCELLED: "red",
        COMPLETED: "blue", REFUND_PENDING: "volcano",
    };
    return map[status] || "default";
};

// ─── Filter Formatter ────────────────────────────────────────────
const formatFilters = (filters) => {
    const params = {};
    if (filters.dateRange?.[0]) params.start_date = filters.dateRange[0].format("YYYY-MM-DD");
    if (filters.dateRange?.[1]) params.end_date = filters.dateRange[1].format("YYYY-MM-DD");
    if (filters.orderType && filters.orderType !== "all") params.order_type = filters.orderType;
    if (filters.tourId) params.tour_id = filters.tourId;
    return params;
};

// ─── Reusable Filter Bar Component ────────────────────────────────
const FilterBar = ({ filters, setFilters, onApply, onReset, showTour = false, showOrderType = false, tours = [] }) => (
    <Card style={{ marginBottom: 16 }} styles={{ body: { padding: "12px 24px" } }}>
        <Row gutter={[16, 12]} align="middle">
            <Col><span style={{ fontWeight: 600 }}><FilterOutlined /> Filters:</span></Col>
            <Col>
                <RangePicker
                    value={filters.dateRange}
                    onChange={(vals) => setFilters(prev => ({ ...prev, dateRange: vals }))}
                    style={{ width: 260 }}
                />
            </Col>
            {showOrderType && (
                <Col>
                    <Select
                        value={filters.orderType || "all"}
                        onChange={(v) => setFilters(prev => ({ ...prev, orderType: v }))}
                        style={{ width: 180 }}
                    >
                        <Option value="all">All Orders</Option>
                        <Option value="tour_package">Tour Package Booking</Option>
                        <Option value="custom_tour_package">Custom Tour Package</Option>
                    </Select>
                </Col>
            )}
            {showTour && (
                <Col>
                    <Select
                        value={filters.tourId || undefined}
                        onChange={(v) => setFilters(prev => ({ ...prev, tourId: v }))}
                        allowClear
                        showSearch
                        placeholder="Select Tour"
                        style={{ width: 200 }}
                        optionFilterProp="children"
                    >
                        {tours.map((t) => <Option key={t.id} value={t.id}>{t.name}</Option>)}
                    </Select>
                </Col>
            )}
            <Col>
                <Space>
                    <Button type="primary" onClick={onApply}>Apply Filter</Button>
                    <Button icon={<ReloadOutlined />} onClick={onReset}>Reset</Button>
                </Space>
            </Col>
        </Row>
    </Card>
);

// ─── Main Reports Page ───────────────────────────────────────────
const ReportsPage = () => {
    const location = useLocation();
    const path = location.pathname;

    // Global tour list for dropdowns
    const [tours, setTours] = useState([]);

    // States for Summary Cards
    const [summaryFilters, setSummaryFilters] = useState({ dateRange: null });
    const [summary, setSummary] = useState({ total_bookings: 0, total_customers: 0, total_revenue: 0, active_tours: 0 });
    const [summaryLoading, setSummaryLoading] = useState(false);

    // States for Bookings Tab
    const [bookingFilters, setBookingFilters] = useState({ dateRange: null, tourId: "" });
    const [bookings, setBookings] = useState([]);
    const [bookingLoading, setBookingLoading] = useState(false);
    const [bookingPagination, setBookingPagination] = useState({ current: 1, pageSize: 50, total: 0 });

    // States for Order Type Tab
    const [orderTypeFilters, setOrderTypeFilters] = useState({ dateRange: null, orderType: "all" });
    const [orders, setOrders] = useState([]);
    const [orderLoading, setOrderLoading] = useState(false);
    const [orderPagination, setOrderPagination] = useState({ current: 1, pageSize: 50, total: 0 });

    // States for Most Booked Tours Tab
    const [mostBookedFilters, setMostBookedFilters] = useState({ dateRange: null });
    const [mostBooked, setMostBooked] = useState([]);
    const [mostBookedLoading, setMostBookedLoading] = useState(false);

    // States for Charts
    const [chartFilters, setChartFilters] = useState({ dateRange: null });
    const [charts, setCharts] = useState({ booking_trend: [], revenue_trend: [], most_booked: [] });
    const [chartsLoading, setChartsLoading] = useState(false);

    // Setup Tour List
    useEffect(() => {
        apiClient.get(endpoints.GET_ALL_TOURS).then(res => setTours(res.data?.data || res.data?.results || [])).catch(() => { });
    }, []);

    // Fetch Functions
    const fetchSummary = useCallback(async () => {
        setSummaryLoading(true);
        try {
            const res = await apiClient.get(endpoints.REPORT_SUMMARY, formatFilters(summaryFilters));
            if (res.data?.success) setSummary({
                total_bookings: res.data.data.total_bookings || 0,
                total_customers: res.data.data.total_customers || 0,
                total_revenue: res.data.data.total_revenue || 0,
                active_tours: res.data.data.active_tours || 0,
            });
        } catch { } finally { setSummaryLoading(false); }
    }, [summaryFilters]);

    const fetchBookings = useCallback(async (page = 1, pageSize = 50) => {
        setBookingLoading(true);
        try {
            const res = await apiClient.get(endpoints.REPORT_BOOKINGS, { ...formatFilters(bookingFilters), page, page_size: pageSize });
            if (res.data?.success) {
                setBookings(res.data.data.results || []);
                setBookingPagination({ current: res.data.data.page, pageSize: res.data.data.page_size, total: res.data.data.total_count });
            }
        } catch { } finally { setBookingLoading(false); }
    }, [bookingFilters]);

    const fetchOrders = useCallback(async (page = 1, pageSize = 50) => {
        setOrderLoading(true);
        try {
            const res = await apiClient.get(endpoints.REPORT_BOOKINGS, { ...formatFilters(orderTypeFilters), page, page_size: pageSize });
            if (res.data?.success) {
                setOrders(res.data.data.results || []);
                setOrderPagination({ current: res.data.data.page, pageSize: res.data.data.page_size, total: res.data.data.total_count });
            }
        } catch { } finally { setOrderLoading(false); }
    }, [orderTypeFilters]);

    const fetchMostBooked = useCallback(async () => {
        setMostBookedLoading(true);
        try {
            const res = await apiClient.get(endpoints.REPORT_MOST_BOOKED, formatFilters(mostBookedFilters));
            if (res.data?.success) setMostBooked(res.data.data || []);
        } catch { } finally { setMostBookedLoading(false); }
    }, [mostBookedFilters]);

    const fetchCharts = useCallback(async () => {
        setChartsLoading(true);
        try {
            const res = await apiClient.get(endpoints.REPORT_CHARTS, formatFilters(chartFilters));
            if (res.data?.success) setCharts({
                booking_trend: res.data.data.booking_trend || [],
                revenue_trend: res.data.data.revenue_trend || [],
                most_booked: res.data.data.most_booked || [],
            });
        } catch { } finally { setChartsLoading(false); }
    }, [chartFilters]);

    // Initial Data Load
    useEffect(() => {
        fetchSummary();
        fetchBookings();
        fetchOrders();
        fetchMostBooked();
        fetchCharts();
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // ─── Columns ───
    const baseBookingCols = [
        { title: "Booking ID", dataIndex: "id", key: "id", width: 120, render: id => `#${String(id).slice(0, 8)}...` },
        { title: "Customer Name", dataIndex: "customer_name", key: "customer_name" },
        { title: "Tour Name", dataIndex: "tour_name", key: "tour_name" },
        { title: "Travelers", dataIndex: "travelers_count", key: "travelers_count", width: 100 },
        { title: "Status", dataIndex: "status", key: "status", width: 120, render: s => <Tag color={getStatusColor(s)}>{s}</Tag> },
        { title: "Date", dataIndex: "booking_date", key: "booking_date", width: 130, render: d => d ? new Date(d).toLocaleDateString() : "N/A" },
        { title: "Amount", dataIndex: "total_amount", key: "total_amount", width: 120, render: v => `₹${Number(v || 0).toLocaleString()}` },
    ];

    const orderTypeCols = [
        ...baseBookingCols.slice(0, 3),
        { title: "Type", dataIndex: "order_type", key: "order_type", width: 150, render: t => <Tag color="blue">{t}</Tag> },
        ...baseBookingCols.slice(3)
    ];

    const mostBookedCols = [
        { title: "Tour Name", dataIndex: "tour_name", key: "tour_name" },
        { title: "Destination", dataIndex: "destination", key: "destination" },
        { title: "Total Bookings", dataIndex: "total_bookings", key: "total_bookings", width: 140 },
        { title: "Total Revenue", dataIndex: "total_revenue", key: "total_revenue", width: 160, render: v => `₹${Number(v || 0).toLocaleString()}` },
    ];

    const exportMenu = (data, columns, name) => ({
        items: [
            { key: "csv", label: "CSV", icon: <FileTextOutlined />, onClick: () => exportToCSV(data, columns, name) },
            { key: "excel", label: "Excel", icon: <FileExcelOutlined />, onClick: () => exportToExcel(data, columns, name) },
            { key: "pdf", label: "PDF", icon: <FilePdfOutlined />, onClick: () => exportToPDF(data, columns, name, "Report") },
        ]
    });

    return (
        <div>
            <h2 style={{ marginBottom: 24 }}><BarChartOutlined /> Reports & Analytics</h2>

            {path.includes('/dashboard') && (
                <>
                    <Card title="Dashboard Summary" style={{ marginBottom: 24 }}>
                        <FilterBar
                            filters={summaryFilters} setFilters={setSummaryFilters}
                            onApply={fetchSummary} onReset={() => { setSummaryFilters({ dateRange: null }); setTimeout(fetchSummary, 50); }}
                        />
                        <Spin spinning={summaryLoading}>
                            <Row gutter={[16, 16]}>
                                <Col xs={24} sm={12} lg={6}>
                                    <Card hoverable styles={{ body: { padding: 20 } }}>
                                        <Statistic title="Total Bookings" value={summary.total_bookings} prefix={<ShoppingCartOutlined style={{ color: "#1890ff" }} />} valueStyle={{ color: "#1890ff" }} />
                                    </Card>
                                </Col>
                                <Col xs={24} sm={12} lg={6}>
                                    <Card hoverable styles={{ body: { padding: 20 } }}>
                                        <Statistic title="Total Customers" value={summary.total_customers} prefix={<TeamOutlined style={{ color: "#722ed1" }} />} valueStyle={{ color: "#722ed1" }} />
                                    </Card>
                                </Col>
                                <Col xs={24} sm={12} lg={6}>
                                    <Card hoverable styles={{ body: { padding: 20 } }}>
                                        <Statistic title="Total Revenue" value={summary.total_revenue} prefix={<DollarOutlined style={{ color: "#52c41a" }} />} precision={2} valueStyle={{ color: "#52c41a" }} />
                                    </Card>
                                </Col>
                                <Col xs={24} sm={12} lg={6}>
                                    <Card hoverable styles={{ body: { padding: 20 } }}>
                                        <Statistic title="Active Tours" value={summary.active_tours} prefix={<CompassOutlined style={{ color: "#faad14" }} />} valueStyle={{ color: "#faad14" }} />
                                    </Card>
                                </Col>
                            </Row>
                        </Spin>
                    </Card>

                    <Card title="Analytics Charts" extra={<FilterBar filters={chartFilters} setFilters={setChartFilters} onApply={fetchCharts} onReset={() => { setChartFilters({ dateRange: null }); setTimeout(fetchCharts, 50); }} />}>
                        <Spin spinning={chartsLoading}>
                            <Row gutter={[16, 24]}>
                                <Col xs={24} lg={12}>
                                    <Card type="inner" title="Booking Trend (Last 6 Months)">
                                        {charts.booking_trend?.length ? (
                                            <ResponsiveContainer width="100%" height={300}>
                                                <LineChart data={charts.booking_trend} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                                                    <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 11 }} />
                                                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11 }} allowDecimals={false} />
                                                    <RechartsTooltip
                                                        contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                                                    />
                                                    <Line
                                                        type="monotone"
                                                        dataKey="count"
                                                        stroke="#1890ff"
                                                        strokeWidth={3}
                                                        dot={{ r: 4, fill: '#1890ff' }}
                                                        activeDot={{ r: 6, strokeWidth: 0 }}
                                                    />
                                                </LineChart>
                                            </ResponsiveContainer>
                                        ) : <Empty />}
                                    </Card>
                                </Col>
                                <Col xs={24} lg={12}>
                                    <Card type="inner" title="Most Booked Tours (Filtered)">
                                        {charts.most_booked?.length ? (
                                            <ResponsiveContainer width="100%" height={300}>
                                                <BarChart data={charts.most_booked} margin={{ top: 10, right: 30, left: 0, bottom: 20 }}>
                                                    <defs>
                                                        <linearGradient id="colorMostBooked" x1="0" y1="0" x2="0" y2="1">
                                                            <stop offset="5%" stopColor="#722ed1" stopOpacity={0.8} />
                                                            <stop offset="95%" stopColor="#722ed1" stopOpacity={0.3} />
                                                        </linearGradient>
                                                    </defs>
                                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                                                    <XAxis
                                                        dataKey="tour_name"
                                                        axisLine={false}
                                                        tickLine={false}
                                                        tick={{ fontSize: 11 }}
                                                        interval={0}
                                                        angle={-25}
                                                        textAnchor="end"
                                                        height={70}
                                                    />
                                                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11 }} allowDecimals={false} />
                                                    <RechartsTooltip
                                                        contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                                                        cursor={{ fill: '#f5f5f5' }}
                                                    />
                                                    <Bar
                                                        dataKey="count"
                                                        fill="url(#colorMostBooked)"
                                                        radius={[4, 4, 0, 0]}
                                                        barSize={40}
                                                    />
                                                </BarChart>
                                            </ResponsiveContainer>
                                        ) : <Empty />}
                                    </Card>
                                </Col>
                                <Col xs={24}>
                                    <Card type="inner" title="Revenue Trend (Last 6 Months)">
                                        {charts.revenue_trend?.length ? (
                                            <ResponsiveContainer width="100%" height={350}>
                                                <BarChart data={charts.revenue_trend} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                                                    <defs>
                                                        <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                                                            <stop offset="5%" stopColor="#52c41a" stopOpacity={0.8} />
                                                            <stop offset="95%" stopColor="#52c41a" stopOpacity={0.2} />
                                                        </linearGradient>
                                                    </defs>
                                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                                                    <XAxis
                                                        dataKey="month"
                                                        axisLine={false}
                                                        tickLine={false}
                                                        tick={{ fill: '#666', fontSize: 12 }}
                                                    />
                                                    <YAxis
                                                        axisLine={false}
                                                        tickLine={false}
                                                        tick={{ fill: '#666', fontSize: 12 }}
                                                        tickFormatter={v => `₹${v >= 1000 ? (v / 1000).toFixed(1) + 'k' : v}`}
                                                    />
                                                    <RechartsTooltip
                                                        cursor={{ fill: '#f5f5f5' }}
                                                        contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                                                        formatter={v => [`₹${Number(v).toLocaleString()}`, 'Revenue']}
                                                    />
                                                    <Legend verticalAlign="top" align="right" height={36} />
                                                    <Bar
                                                        name="Monthly Revenue"
                                                        dataKey="revenue"
                                                        fill="url(#colorRevenue)"
                                                        radius={[6, 6, 0, 0]}
                                                        barSize={60}
                                                        animationDuration={1500}
                                                    />
                                                </BarChart>
                                            </ResponsiveContainer>
                                        ) : <Empty />}
                                    </Card>
                                </Col>
                            </Row>
                        </Spin>
                    </Card>
                </>
            )}

            {path.includes('/bookings') && (
                <Card title="Booking Report">
                    <FilterBar filters={bookingFilters} setFilters={setBookingFilters} showTour tours={tours} onApply={() => fetchBookings(1)} onReset={() => { setBookingFilters({ dateRange: null, tourId: "" }); setTimeout(() => fetchBookings(1), 50); }} />
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
                        <span>Total: <strong>{bookingPagination.total}</strong> bookings</span>
                        <Dropdown menu={exportMenu(bookings, baseBookingCols, "BookingReport")}><Button icon={<DownloadOutlined />}>Export</Button></Dropdown>
                    </div>
                    <Table dataSource={bookings} columns={baseBookingCols} rowKey="id" loading={bookingLoading} pagination={{ ...bookingPagination, onChange: (p, s) => fetchBookings(p, s) }} scroll={{ x: 1000 }} />
                </Card>
            )}

            {path.includes('/order-types') && (
                <Card title="Order Type Report">
                    <FilterBar filters={orderTypeFilters} setFilters={setOrderTypeFilters} showOrderType onApply={() => fetchOrders(1)} onReset={() => { setOrderTypeFilters({ dateRange: null, orderType: "all" }); setTimeout(() => fetchOrders(1), 50); }} />
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
                        <span>Showing: <strong>{orderPagination.total}</strong> records</span>
                        <Dropdown menu={exportMenu(orders, orderTypeCols, "OrderTypeReport")}><Button icon={<DownloadOutlined />}>Export</Button></Dropdown>
                    </div>
                    <Table dataSource={orders} columns={orderTypeCols} rowKey="id" loading={orderLoading} pagination={{ ...orderPagination, onChange: (p, s) => fetchOrders(p, s) }} scroll={{ x: 1100 }} />
                </Card>
            )}

            {path.includes('/top-tours') && (
                <Card title="Top Booked Tours">
                    <FilterBar filters={mostBookedFilters} setFilters={setMostBookedFilters} onApply={fetchMostBooked} onReset={() => { setMostBookedFilters({ dateRange: null }); setTimeout(fetchMostBooked, 50); }} />
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
                        <span>Top 10 tours</span>
                        <Dropdown menu={exportMenu(mostBooked, mostBookedCols, "MostBookedTours")}><Button icon={<DownloadOutlined />}>Export</Button></Dropdown>
                    </div>
                    <Table dataSource={mostBooked} columns={mostBookedCols} rowKey="tour_name" loading={mostBookedLoading} pagination={false} />
                </Card>
            )}
        </div>
    );
};
export default ReportsPage;
