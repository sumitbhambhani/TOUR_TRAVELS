import React, { useEffect, useState } from "react";
import {
  Table,
  Button,
  Space,
  Card,
  message,
  Tag,
  Modal,
  Descriptions,
  Input,
  Select,
  DatePicker,
  Divider,
  Typography,
} from "antd";
import {
  EyeOutlined,
  EditOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  EnvironmentOutlined,
  CalendarOutlined,
  CarOutlined,
  HomeOutlined,
  DollarOutlined,
  TeamOutlined,
} from "@ant-design/icons";
import { apiClient } from "../../services/api";
import { endpoints } from "../../constant/ENDPOINTS";

const { Search } = Input;
const { Option } = Select;
const { RangePicker } = DatePicker;
const { Text, Title } = Typography;

const BookingsList = () => {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [updatingBookingId, setUpdatingBookingId] = useState(null);

  useEffect(() => {
    fetchBookings();
  }, []);

  const fetchBookings = async () => {
    try {
      setLoading(true);
      const response = await apiClient.get(endpoints.GET_BOOKINGS);
      const bookingsData = response.data?.data || response.data?.results || [];
      setBookings(Array.isArray(bookingsData) ? bookingsData : []);
    } catch (error) {
      console.error("Error fetching bookings:", error);
      message.error("Failed to load bookings");
      setBookings([]);
    } finally {
      setLoading(false);
    }
  };

  const handleStatusUpdate = async (bookingId, newStatus) => {
    Modal.confirm({
      title: `Confirm Status Change`,
      content: `Are you sure you want to change this booking status to ${newStatus}?`,
      okText: 'Yes, Change Status',
      cancelText: 'Cancel',
      onOk: async () => {
        setUpdatingBookingId(bookingId);
        try {
          await apiClient.patch(endpoints.GET_BOOKING_DETAIL(bookingId), {
            status: newStatus,
          });
          message.success(`Booking ${newStatus.toLowerCase()} successfully`);
          fetchBookings();
        } catch (error) {
          console.error("Error updating booking status:", error);
          message.error("Failed to update booking status");
        } finally {
          setUpdatingBookingId(null);
        }
      }
    });
  };

  const showBookingDetails = (booking) => {
    setSelectedBooking(booking);
    setDetailModalVisible(true);
  };

  // Helper: get tour display name
  const getTourDisplayName = (record) => {
    if (record.tour_details?.name) return record.tour_details.name;
    if (record.tour_name) return record.tour_name;
    if (record.tour?.title) return record.tour?.title;
    const cpd = record.custom_package_details;
    if (cpd) return cpd.destination;
    return null;
  };

  const filteredBookings = Array.isArray(bookings)
    ? bookings.filter((booking) => {
      const searchLower = searchText.toLowerCase();
      const matchesSearch =
        (booking.user_details?.username?.toLowerCase() || "").includes(searchLower) ||
        (booking.user_details?.email?.toLowerCase() || "").includes(searchLower) ||
        (booking.user_details?.full_name?.toLowerCase() || "").includes(searchLower) ||
        (booking.user?.username?.toLowerCase() || "").includes(searchLower) ||
        (booking.user?.email?.toLowerCase() || "").includes(searchLower) ||
        (getTourDisplayName(booking) || "").toLowerCase().includes(searchLower) ||
        (booking.tour_name?.toLowerCase() || "").includes(searchLower);
        
      const matchesStatus =
        filterStatus === "all" ||
        booking.status?.toUpperCase() === filterStatus.toUpperCase();
      return matchesSearch && matchesStatus;
    })
    : [];

  const getStatusColor = (status) => {
    const colors = {
      CONFIRMED: "green",
      confirmed: "green",
      PENDING: "orange",
      pending: "orange",
      CANCELLED: "red",
      cancelled: "red",
      COMPLETED: "blue",
      completed: "blue",
      REFUND_PENDING: "orange",
      CANCELLED_REFUNDED: "cyan",
      CANCELLED_NOT_REFUNDED: "volcano",
    };
    return colors[status] || "default";
  };

  const getPaymentStatusColor = (status) => {
    const colors = {
      success: "green",
      SUCCESS: "green",
      paid: "green",
      pending: "orange",
      PENDING: "orange",
      failed: "red",
      FAILED: "red",
      refunded: "purple",
      REFUNDED: "purple",
    };
    return colors[status] || "default";
  };

  const columns = [
    {
      title: "Booking ID",
      dataIndex: "id",
      key: "id",
      width: 100,
      render: (id) => `#${String(id).substring(0, 8)}`,
    },
    {
      title: "Customer",
      key: "customer",
      render: (_, record) => (
        <div>
          <div style={{ fontWeight: "bold" }}>
            {record.user_details?.full_name ||
              record.user_details?.username ||
              record.user?.username ||
              'N/A'}
          </div>
          <div style={{ fontSize: "12px", color: "#666" }}>
            {record.user_details?.email ||
              record.user?.email ||
              'N/A'}
          </div>
        </div>
      ),
    },
    {
      title: "Tour",
      key: "tour",
      render: (_, record) => {
        const tourName = getTourDisplayName(record);
        const isCustom = !record.tour_details?.name && !record.tour_name && !record.tour?.title;
        const cpd = record.custom_package_details;
        return (
          <div>
            <div style={{ fontWeight: "bold" }}>
              {isCustom ? (
                <Space>
                  <Tag color="purple">Customized</Tag>
                  {tourName && <span>{tourName}</span>}
                </Space>
              ) : tourName}
            </div>
            <div style={{ fontSize: "12px", color: "#666" }}>
              {cpd ? (
                <span>{cpd.duration} • {cpd.participants_count} person(s)</span>
              ) : (
                <span>{record.tour_details?.duration_days || record.tour?.duration_days || 0} Days</span>
              )}
            </div>
          </div>
        );
      },
    },
    {
      title: "Travel Date",
      dataIndex: "travel_date",
      key: "travel_date",
      render: (date) => date ? new Date(date).toLocaleDateString() : 'N/A',
      sorter: (a, b) => new Date(a.travel_date) - new Date(b.travel_date),
    },
    {
      title: "People",
      key: "people",
      width: 80,
      render: (_, record) => record.travelers_count || record.no_people || 0,
      sorter: (a, b) => (a.travelers_count || a.no_people || 0) - (b.travelers_count || b.no_people || 0),
    },
    {
      title: "Total Price",
      key: "total_price",
      render: (_, record) => {
        const price = Number(record.total_price || 0);
        const paidAmount = Number(record.payment_details?.amount || 0);
        const displayPrice = price > 0 ? price : (paidAmount > 0 ? paidAmount : 0);
        return `₹${displayPrice.toLocaleString('en-IN')}`;
      },
      sorter: (a, b) => {
        const priceA = Number(a.total_price || a.payment_details?.amount || 0);
        const priceB = Number(b.total_price || b.payment_details?.amount || 0);
        return priceA - priceB;
      },
    },
    {
      title: "Status",
      dataIndex: "status",
      key: "status",
      render: (status) => (
        <Tag color={getStatusColor(status)}>{status?.toUpperCase()}</Tag>
      ),
      filters: [
        { text: "Confirmed", value: "CONFIRMED" },
        { text: "Pending", value: "PENDING" },
        { text: "Cancelled", value: "CANCELLED" },
        { text: "Completed", value: "COMPLETED" },
        { text: "Refund Pending", value: "REFUND_PENDING" },
        { text: "Cancelled & Refunded", value: "CANCELLED_REFUNDED" },
        { text: "Cancelled & Refund Rejected", value: "CANCELLED_NOT_REFUNDED" },
      ],
      onFilter: (value, record) => record.status === value,
    },
    {
      title: "Payment",
      key: "payment",
      render: (_, record) => {
        const paymentStatus = record.payment_details?.status || 'PENDING';
        const totalPaid = Number(record.total_paid || 0);
        const balanceDue = Number(record.balance_due !== undefined ? record.balance_due : 0);
        const total = Number(record.total_price || record.payment_details?.amount || 0);
        
        let statusTag = null;
        if (total > 0 && balanceDue <= 0) {
           statusTag = <Tag color="green">FULLY PAID</Tag>;
        } else if (totalPaid > 0) {
           statusTag = <Tag color="orange">PARTIALLY PAID</Tag>;
        } else {
           statusTag = <Tag color={getPaymentStatusColor(paymentStatus)}>{paymentStatus.toUpperCase()}</Tag>;
        }

        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <div>{statusTag}</div>
            {totalPaid > 0 && <span style={{ fontSize: '12px' }}>Paid: ₹{totalPaid.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>}
            {balanceDue > 0 && <span style={{ fontSize: '12px', color: '#ff4d4f' }}>Due: ₹{balanceDue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>}
          </div>
        );
      },
    },
    {
      title: "Actions",
      key: "actions",
      width: 200,
      render: (_, record) => (
        <Space>
          <Button
            type="primary"
            size="small"
            icon={<EyeOutlined />}
            onClick={() => showBookingDetails(record)}
          >
            View
          </Button>
          {record.status === "PENDING" && (
            <>
              <Button
                type="primary"
                size="small"
                icon={<CheckCircleOutlined />}
                loading={updatingBookingId === record.id}
                onClick={() => handleStatusUpdate(record.id, "CONFIRMED")}
                style={{ backgroundColor: '#52c41a', borderColor: '#52c41a' }}
              >
                Confirm
              </Button>
              <Button
                danger
                size="small"
                icon={<CloseCircleOutlined />}
                loading={updatingBookingId === record.id}
                onClick={() => handleStatusUpdate(record.id, "CANCELLED")}
              >
                Cancel
              </Button>
            </>
          )}
          {record.status === "REFUND_PENDING" && (
            <>
              <Button
                type="primary"
                size="small"
                loading={updatingBookingId === record.id}
                onClick={() => handleStatusUpdate(record.id, "CANCELLED_REFUNDED")}
                style={{ backgroundColor: '#52c41a', borderColor: '#52c41a' }}
              >
                Accept Refund
              </Button>
              <Button
                danger
                size="small"
                loading={updatingBookingId === record.id}
                onClick={() => handleStatusUpdate(record.id, "CANCELLED_NOT_REFUNDED")}
              >
                Reject Refund
              </Button>
            </>
          )}
          {record.status === "CONFIRMED" && (
            <Button
              type="primary"
              size="small"
              loading={updatingBookingId === record.id}
              onClick={() => handleStatusUpdate(record.id, "COMPLETED")}
              style={{ backgroundColor: '#1890ff', borderColor: '#1890ff' }}
            >
              Complete
            </Button>
          )}
        </Space>
      ),
    },
  ];

  // Render the quotation breakdown section in the detail modal
  const renderQuotationBreakdown = (breakdown) => {
    if (!breakdown) return null;
    const transport = breakdown.transportation || {};
    const accommodation = breakdown.accommodation || {};
    const summary = breakdown.summary || {};
    return (
      <div style={{ marginTop: 16 }}>
        <Divider orientation="left"><DollarOutlined /> Quotation Breakdown</Divider>
        <Descriptions bordered size="small" column={2}>
          {/* Transportation */}
          <Descriptions.Item label="Transport Type" span={1}>
            <Tag color="blue">{transport.type?.toUpperCase() || 'N/A'}</Tag>
          </Descriptions.Item>
          <Descriptions.Item label="Travel Cost (Total)" span={1}>
            ₹{Number(transport.total_travel_cost || 0).toLocaleString('en-IN')}
          </Descriptions.Item>
          {transport.kms_distance && (
            <Descriptions.Item label="Distance" span={1}>
              {transport.kms_distance} km
            </Descriptions.Item>
          )}
          {transport.price_per_km && (
            <Descriptions.Item label="Rate / km" span={1}>
              ₹{transport.price_per_km}
            </Descriptions.Item>
          )}
          {transport.direct_price_per_person && (
            <Descriptions.Item label="Per-Person Fare" span={1}>
              ₹{Number(transport.direct_price_per_person).toLocaleString('en-IN')}
            </Descriptions.Item>
          )}

          {/* Accommodation */}
          <Descriptions.Item label="Hotel Tier" span={1}>
            {accommodation.hotel_tier || 'N/A'}
          </Descriptions.Item>
          <Descriptions.Item label="Room Type" span={1}>
            {accommodation.room_type || 'N/A'}
          </Descriptions.Item>
          {accommodation.selected_hotel_name && (
            <Descriptions.Item label="Hotel" span={2}>
              <strong>{accommodation.selected_hotel_name}</strong>
            </Descriptions.Item>
          )}
          <Descriptions.Item label="Price/Night" span={1}>
            ₹{Number(accommodation.price_per_night || 0).toLocaleString('en-IN')}
          </Descriptions.Item>
          <Descriptions.Item label="Nights" span={1}>
            {accommodation.nights || 0}
          </Descriptions.Item>
          <Descriptions.Item label="Hotel Cost (Total)" span={2}>
            ₹{Number(accommodation.total_hotel_cost || 0).toLocaleString('en-IN')}
          </Descriptions.Item>

          {/* Summary */}
          <Descriptions.Item label="Base Cost / Person" span={1}>
            ₹{Number(summary.base_cost_per_person || 0).toLocaleString('en-IN')}
          </Descriptions.Item>
          <Descriptions.Item label="Participants" span={1}>
            {summary.participants || 0}
          </Descriptions.Item>
          <Descriptions.Item label="Total Base Cost" span={1}>
            ₹{Number(summary.total_base_cost || 0).toLocaleString('en-IN')}
          </Descriptions.Item>
          <Descriptions.Item label="Margin (20%)" span={1}>
            ₹{Number(summary.margin_20_percent || 0).toLocaleString('en-IN')}
          </Descriptions.Item>
          <Descriptions.Item label={<strong>Final Quoted Price</strong>} span={2}>
            <Text strong style={{ fontSize: 16, color: '#52c41a' }}>
              ₹{Number(summary.final_quoted_price || 0).toLocaleString('en-IN')}
            </Text>
          </Descriptions.Item>
        </Descriptions>
      </div>
    );
  };

  return (
    <div>
      <Card>
        <div
          style={{
            marginBottom: 16,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 16,
          }}
        >
          <h2 style={{ margin: 0 }}>Bookings Management</h2>
        </div>

        <div
          style={{
            marginBottom: 16,
            display: "flex",
            gap: 16,
            flexWrap: "wrap",
          }}
        >
          <Search
            placeholder="Search bookings..."
            allowClear
            style={{ width: 300 }}
            onSearch={setSearchText}
            onChange={(e) => setSearchText(e.target.value)}
          />
          <Select
            placeholder="Filter by status"
            style={{ width: 150 }}
            value={filterStatus}
            onChange={setFilterStatus}
          >
            <Option value="all">All Status</Option>
            <Option value="CONFIRMED">Confirmed</Option>
            <Option value="PENDING">Pending</Option>
            <Option value="CANCELLED">Cancelled</Option>
            <Option value="COMPLETED">Completed</Option>
            <Option value="REFUND_PENDING">Refund Pending</Option>
            <Option value="CANCELLED_REFUNDED">Cancelled & Refunded</Option>
            <Option value="CANCELLED_NOT_REFUNDED">Cancelled & Refund Rejected</Option>
          </Select>
        </div>

        <Table
          columns={columns}
          dataSource={filteredBookings}
          rowKey="id"
          loading={loading}
          pagination={{
            pageSize: 10,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total, range) =>
              `${range[0]}-${range[1]} of ${total} bookings`,
          }}
          scroll={{ x: 1200 }}
        />
      </Card>

      {/* Booking Details Modal */}
      <Modal
        title={`Booking Details - #${selectedBooking?.id ? String(selectedBooking.id).substring(0, 8) : ''}`}
        open={detailModalVisible}
        onCancel={() => setDetailModalVisible(false)}
        footer={[
          <Button key="close" onClick={() => setDetailModalVisible(false)}>
            Close
          </Button>,
        ]}
        width={900}
      >
        {selectedBooking && (
          <div style={{ maxHeight: '70vh', overflowY: 'auto' }}>
            {/* Basic Booking Info */}
            <Descriptions bordered column={2}>
              <Descriptions.Item label="Customer" span={2}>
                <div>
                  <strong>
                    {selectedBooking.user_details?.full_name ||
                      selectedBooking.user_details?.username ||
                      selectedBooking.user?.username ||
                      'N/A'}
                  </strong>
                  <br />
                  <span style={{ color: "#666" }}>
                    {selectedBooking.user_details?.email ||
                      selectedBooking.user?.email ||
                      'N/A'}
                  </span>
                </div>
              </Descriptions.Item>
              <Descriptions.Item label="Tour" span={2}>
                <div>
                  <strong>
                    {(() => {
                      const name = getTourDisplayName(selectedBooking);
                      const isCustom = !!selectedBooking.custom_package_details;
                      if (isCustom) {
                        return (
                          <Space>
                            <Tag color="purple">Customized</Tag>
                            {name && <span>{name}</span>}
                          </Space>
                        );
                      }
                      return name || 'N/A';
                    })()}
                  </strong>
                  <br />
                  <span style={{ color: "#666" }}>
                    {selectedBooking.custom_package_details
                      ? `${selectedBooking.custom_package_details.duration} • ${selectedBooking.custom_package_details.participants_count} person(s)`
                      : `Duration: ${selectedBooking.tour_details?.duration_days || selectedBooking.tour?.duration_days || 0} Days`}
                  </span>
                </div>
              </Descriptions.Item>
              <Descriptions.Item label="Booking Date">
                {selectedBooking.booking_date ? new Date(selectedBooking.booking_date).toLocaleDateString() : 'N/A'}
              </Descriptions.Item>
              <Descriptions.Item label="Travel Date">
                {selectedBooking.travel_date ? new Date(selectedBooking.travel_date).toLocaleDateString() : 'N/A'}
              </Descriptions.Item>
              <Descriptions.Item label="Number of People">
                {selectedBooking.travelers_count || selectedBooking.no_people || 0}
              </Descriptions.Item>
              <Descriptions.Item label="Total Price">
                <Text strong style={{ color: '#52c41a' }}>
                  ₹{(Number(selectedBooking.total_price || 0) > 0
                    ? Number(selectedBooking.total_price)
                    : Number(selectedBooking.payment_details?.amount || 0)).toLocaleString('en-IN')}
                </Text>
              </Descriptions.Item>
              <Descriptions.Item label="Booking Status">
                <Tag color={getStatusColor(selectedBooking.status)}>
                  {selectedBooking.status?.toUpperCase()}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Payment Status">
                {(() => {
                  const paymentStatus = selectedBooking.payment_details?.status || 'PENDING';
                  const totalPaid = Number(selectedBooking.total_paid || 0);
                  const balanceDue = Number(selectedBooking.balance_due !== undefined ? selectedBooking.balance_due : 0);
                  const total = Number(selectedBooking.total_price || selectedBooking.payment_details?.amount || 0);
                  
                  if (total > 0 && balanceDue <= 0) {
                     return <Tag color="green">FULLY PAID</Tag>;
                  } else if (totalPaid > 0) {
                     return <Tag color="orange">PARTIALLY PAID</Tag>;
                  } else {
                     return <Tag color={getPaymentStatusColor(paymentStatus)}>{paymentStatus.toUpperCase()}</Tag>;
                  }
                })()}
              </Descriptions.Item>
              <Descriptions.Item label="Total Paid">
                <Text strong style={{ color: '#1890ff' }}>
                  ₹{Number(selectedBooking.total_paid || selectedBooking.payment_details?.amount || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                </Text>
              </Descriptions.Item>
              <Descriptions.Item label="Balance Due">
                <Text strong style={{ color: Number(selectedBooking.balance_due) > 0 ? '#ff4d4f' : '#666' }}>
                  ₹{Number(selectedBooking.balance_due || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                </Text>
              </Descriptions.Item>
              <Descriptions.Item label="Last Payment Method">
                {selectedBooking.payment_details?.payment_method || 'Not specified'}
              </Descriptions.Item>
              <Descriptions.Item label="Last Transaction ID" span={2}>
                <span style={{ fontFamily: 'monospace', fontSize: '12px' }}>
                  {selectedBooking.payment_details?.transaction_id || 'N/A'}
                </span>
              </Descriptions.Item>
              <Descriptions.Item label="Contact Number">
                {selectedBooking.contact_number || 'N/A'}
              </Descriptions.Item>
              <Descriptions.Item label="Emergency Contact">
                {selectedBooking.emergency_contact || 'N/A'}
              </Descriptions.Item>
              {selectedBooking.special_requests && (
                <Descriptions.Item label="Special Requests" span={2}>
                  <div style={{ whiteSpace: 'pre-wrap' }}>{selectedBooking.special_requests}</div>
                </Descriptions.Item>
              )}
              {selectedBooking.cancellation_reason && (
                <Descriptions.Item label="Cancellation Reason" span={2}>
                  <div style={{ color: 'red' }}>{selectedBooking.cancellation_reason}</div>
                </Descriptions.Item>
              )}
              {selectedBooking.aadhar_card && (
                <Descriptions.Item label="Identity (Aadhar)" span={2}>
                  <a
                    href={selectedBooking.aadhar_card.startsWith('http') ? selectedBooking.aadhar_card : `http://127.0.0.1:8000${selectedBooking.aadhar_card}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Button icon={<EyeOutlined />}>View Aadhar Card</Button>
                  </a>
                </Descriptions.Item>
              )}
              {Array.isArray(selectedBooking.traveler_details) && selectedBooking.traveler_details.length > 0 && (
                <Descriptions.Item label="Passengers" span={2}>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr>
                          <th style={{ border: '1px solid #eee', padding: '8px', textAlign: 'left' }}>Name</th>
                          <th style={{ border: '1px solid #eee', padding: '8px', textAlign: 'left' }}>Age</th>
                          <th style={{ border: '1px solid #eee', padding: '8px', textAlign: 'left' }}>Gender</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedBooking.traveler_details.map((t, idx) => (
                          <tr key={idx}>
                            <td style={{ border: '1px solid #eee', padding: '8px' }}>{t.name || 'N/A'}</td>
                            <td style={{ border: '1px solid #eee', padding: '8px' }}>{t.age ?? 'N/A'}</td>
                            <td style={{ border: '1px solid #eee', padding: '8px', textTransform: 'capitalize' }}>{t.gender || t.category || 'N/A'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Descriptions.Item>
              )}
            </Descriptions>

            {/* Custom Package Details Section */}
            {selectedBooking.custom_package_details && (
              <>
                <Divider orientation="left"><EnvironmentOutlined /> Custom Trip Details</Divider>
                <Descriptions bordered size="small" column={2}>
                  <Descriptions.Item label="Destination">
                    <strong>{selectedBooking.custom_package_details.destination}</strong>
                  </Descriptions.Item>
                  <Descriptions.Item label="From City">
                    {selectedBooking.custom_package_details.from_city || 'N/A'}
                  </Descriptions.Item>
                  <Descriptions.Item label="Duration">
                    {selectedBooking.custom_package_details.duration}
                  </Descriptions.Item>
                  <Descriptions.Item label="Total Nights">
                    {selectedBooking.custom_package_details.total_nights}
                  </Descriptions.Item>
                  <Descriptions.Item label="Hotel Preference">
                    <Tag color="blue">{selectedBooking.custom_package_details.hotel_preference || 'N/A'}</Tag>
                  </Descriptions.Item>
                  <Descriptions.Item label="Room Type">
                    {selectedBooking.custom_package_details.room_type || 'N/A'}
                  </Descriptions.Item>
                  <Descriptions.Item label="Transportation">
                    <Tag icon={<CarOutlined />} color="cyan">
                      {selectedBooking.custom_package_details.transportation_choice || 'N/A'}
                    </Tag>
                  </Descriptions.Item>
                  <Descriptions.Item label="Package Type">
                    {selectedBooking.custom_package_details.package_type || 'N/A'}
                  </Descriptions.Item>
                  <Descriptions.Item label="Budget Range">
                    {selectedBooking.custom_package_details.budget_range?.replace('-', ' - ₹') || 'N/A'}
                  </Descriptions.Item>
                  <Descriptions.Item label="Quoted Price">
                    <Text strong style={{ color: '#52c41a' }}>
                      ₹{Number(selectedBooking.custom_package_details.final_quoted_price || selectedBooking.custom_package_details.quoted_price || 0).toLocaleString('en-IN')}
                    </Text>
                  </Descriptions.Item>
                  {selectedBooking.custom_package_details.special_requirements && (
                    <Descriptions.Item label="Special Requirements" span={2}>
                      {selectedBooking.custom_package_details.special_requirements}
                    </Descriptions.Item>
                  )}
                  {selectedBooking.custom_package_details.admin_response && (
                    <Descriptions.Item label="Admin Response" span={2}>
                      {selectedBooking.custom_package_details.admin_response}
                    </Descriptions.Item>
                  )}
                </Descriptions>

                {/* Quotation Breakdown */}
                {renderQuotationBreakdown(selectedBooking.custom_package_details.quotation_breakdown)}
              </>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
};

export default BookingsList;
