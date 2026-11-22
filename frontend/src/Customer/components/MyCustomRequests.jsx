import React, { useState, useEffect } from "react";
import { 
  Card, 
  Table, 
  Tag, 
  Button, 
  Modal, 
  Typography, 
  Row, 
  Col, 
  Divider, 
  Space,
  Empty,
  Spin,
  message,
  Timeline,
  Descriptions,
  Popconfirm,
  Form,
  Input,
  DatePicker
} from "antd";
import {
  EyeOutlined,
  CalendarOutlined,
  EnvironmentOutlined,
  UserOutlined,
  DollarOutlined,
  MessageOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  ExclamationCircleOutlined,
  CloseCircleOutlined,
  CreditCardOutlined,
  LockOutlined,
  SafetyCertificateOutlined
} from "@ant-design/icons";
import { motion } from "framer-motion";
import dayjs from "dayjs";
import { apiClient } from "../../services/api";
import { endpoints } from "../../constant/ENDPOINTS";
import { useUser } from "../../context/userContext";
import { useNavigate } from "react-router-dom";
import { useRazorpayScript } from "../../hooks/useRazorpayScript";
import { createRazorpayOrder, openRazorpayCheckout } from "../../utils/razorpayUtils";

const { Title, Text, Paragraph } = Typography;

const MyCustomRequests = () => {
  const { user } = useUser();
  const navigate = useNavigate();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [processingPayment, setProcessingPayment] = useState(false);
  const [paymentModalVisible, setPaymentModalVisible] = useState(false);
  const [paymentForm] = Form.useForm();
  const isRazorpayLoaded = useRazorpayScript();

  useEffect(() => {
    if (user) {
      fetchCustomRequests();
    }
  }, [user]);

  const fetchCustomRequests = async () => {
    try {
      setLoading(true);
      const response = await apiClient.get(endpoints.GET_CUSTOM_PACKAGES);
      setRequests(response.data?.data || response.data?.results || response.data || []);
    } catch (error) {
      console.error("Error fetching custom requests:", error);
      message.error("Failed to load custom requests");
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status) => {
    const colors = {
      'PENDING': 'orange',
      'PROCESSING': 'blue',
      'QUOTED': 'purple',
      'CONFIRMED': 'green',
      'CANCELLED': 'red'
    };
    return colors[status] || 'default';
  };

  const getStatusIcon = (status) => {
    const icons = {
      'PENDING': <ClockCircleOutlined />,
      'PROCESSING': <ExclamationCircleOutlined />,
      'QUOTED': <DollarOutlined />,
      'CONFIRMED': <CheckCircleOutlined />,
      'CANCELLED': <ExclamationCircleOutlined />
    };
    return icons[status] || <ClockCircleOutlined />;
  };

  const handleCustomerResponse = async (requestId, response) => {
    try {
      await apiClient.post(endpoints.USER_RESPOND_QUOTATION(requestId), {
        response: response
      });
      
      message.success(`Quote ${response.toLowerCase()} successfully!`);
      fetchCustomRequests(); // Refresh the list
      setModalVisible(false);
    } catch (error) {
      console.error("Error submitting customer response:", error);
      message.error("Failed to submit response. Please try again.");
    }
  };

  const parseDetailedItinerary = (detailedItinerary) => {
    try {
      return typeof detailedItinerary === 'string' 
        ? JSON.parse(detailedItinerary) 
        : detailedItinerary;
    } catch {
      return null;
    }
  };

  const processCustomPayment = async () => {
    if (!selectedRequest) return;
    setProcessingPayment(true);
    try {
      // 1. Mark as ACCEPTED if it's currently PENDING
      if (selectedRequest.customer_response === 'PENDING') {
        await apiClient.post(endpoints.USER_RESPOND_QUOTATION(selectedRequest.id), {
          response: 'ACCEPTED'
        });
      }

      // 2. Auto-Convert to Booking so we can attach the payment
      const convertRes = await apiClient.post(
        endpoints.CONVERT_CUSTOM_PACKAGE_TO_BOOKING(selectedRequest.id),
        {}
      );
      const convertData = convertRes.data?.data || convertRes.data || {};
      const bookingId = convertData.booking_id;
      const totalAmount = convertData.total_amount;
      
      // 30% advance payment
      const advanceAmount = totalAmount * 0.3;

      if (!bookingId) {
        throw new Error("Booking ID not returned");
      }

      if (!isRazorpayLoaded) {
        throw new Error("Razorpay SDK not loaded");
      }

      // 3. Request Razorpay Order and trigger SDK
      const amountPaise = ~~(advanceAmount * 100);
      const orderRes = await createRazorpayOrder({
        amount: amountPaise,
        currency: 'INR',
        contextType: 'custom_package_advance',
        contextId: bookingId
      });
      const order = orderRes.data || orderRes;

      openRazorpayCheckout({
        orderId: order.id,
        amount: order.amount,
        currency: order.currency,
        prefill: {
          name: user?.username || '',
          email: user?.email || '',
        },
        theme: { color: '#0d9488' },
        onSuccess: async (res) => {
          setProcessingPayment(false);
          message.success("30% Advance Payment successful! Request converted to Pending Booking.");
          setModalVisible(false);
          setPaymentModalVisible(false);
          fetchCustomRequests();
          navigate("/my-bookings");
        },
        onFailure: (err) => {
          setProcessingPayment(false);
          console.error(err);
          message.error("Payment failed or was cancelled.");
        }
      });
    } catch (error) {
      console.error("Payment failed:", error);
      message.error("Failed to complete payment initialization. Please try again.");
      setProcessingPayment(false);
    }
  };

  const columns = [
    {
      title: "Request ID",
      dataIndex: "id",
      key: "id",
      render: (text) => <Text copyable={{ text: text }} style={{ color: 'var(--primary-color)' }}>#{text}</Text>,
    },
    {
      title: "Destinations",
      dataIndex: "destination",
      key: "destination",
      render: (text) => <Text strong>{text}</Text>
    },
    {
      title: "Duration",
      dataIndex: "duration",
      key: "duration",
      render: (text) => (
        <Space>
          <CalendarOutlined style={{ color: 'var(--text-tertiary)' }} />
          {text}
        </Space>
      ),
    },
    {
      title: "Budget",
      dataIndex: "budget_range",
      key: "budget_range",
      render: (budget) => <Text>₹{budget?.replace('-', ' - ₹')}</Text>,
    },
    {
      title: "Status",
      dataIndex: "status",
      key: "status",
      render: (status) => (
        <Tag color={getStatusColor(status)} icon={getStatusIcon(status)}>
          {status.replace('_', ' ')}
        </Tag>
      ),
    },
    {
      title: "Quoted Price",
      dataIndex: "final_quoted_price",
      key: "final_quoted_price",
      render: (price, record) => {
        const p = price || record.quoted_price;
        return p ? <Text strong style={{ color: 'var(--success-color)' }}>₹{Number(p).toLocaleString()}</Text> : <Text type="secondary">Not quoted</Text>;
      },
    },
    {
      title: "Customer Response",
      dataIndex: "customer_response",
      key: "customer_response",
      render: (response, record) => {
        if (!record.quoted_price) return <Text type="secondary">No quote yet</Text>;
        
        const colors = {
          'PENDING': 'orange',
          'ACCEPTED': 'green',
          'REJECTED': 'red'
        };
        
        const icons = {
          'PENDING': <ClockCircleOutlined />,
          'ACCEPTED': <CheckCircleOutlined />,
          'REJECTED': <CloseCircleOutlined />
        };
        
        return (
          <Tag color={colors[response]} icon={icons[response]}>
            {response === 'PENDING' ? 'Pending Response' : response.toLowerCase()}
          </Tag>
        );
      },
    },
    {
      title: "Actions",
      key: "actions",
      render: (_, record) => (
        <Button
          type="primary"
          size="small"
          icon={<EyeOutlined />}
          onClick={() => {
            setSelectedRequest(record);
            setModalVisible(true);
          }}
        >
          View Details
        </Button>
      ),
    },
  ];

  const renderDetailModal = () => {
    if (!selectedRequest) return null;

    const detailedItinerary = parseDetailedItinerary(selectedRequest.detailed_itinerary);

    return (
      <Modal
        title={`Custom Tour Request #${selectedRequest.id}`}
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        footer={null}
        width={800}
      >
        <div style={{ maxHeight: '70vh', overflowY: 'auto' }}>
          {/* Status Timeline */}
          <Card size="small" style={{ marginBottom: '20px' }}>
            <Timeline
              items={[
                {
                  color: 'green',
                  children: `Request submitted on ${dayjs(selectedRequest.created_at).format('DD MMM YYYY')}`
                },
                {
                  color: selectedRequest.status === 'PENDING' ? 'gray' : 'blue',
                  children: selectedRequest.status !== 'PENDING' ? 'Request under review' : 'Waiting for review'
                },
                {
                  color: (selectedRequest.final_quoted_price || selectedRequest.quoted_price) ? 'purple' : 'gray',
                  children: (selectedRequest.final_quoted_price || selectedRequest.quoted_price) ? `Quoted: ₹${Number(selectedRequest.final_quoted_price || selectedRequest.quoted_price).toLocaleString()}` : 'Quote pending'
                },
                {
                  color: selectedRequest.customer_response === 'ACCEPTED' ? 'green' : 
                         selectedRequest.customer_response === 'REJECTED' ? 'red' : 'gray',
                  children: selectedRequest.customer_response === 'ACCEPTED' ? 'Quote accepted by customer' :
                           selectedRequest.customer_response === 'REJECTED' ? 'Quote rejected by customer' :
                           'Customer response pending'
                },
                {
                  color: selectedRequest.status === 'CONFIRMED' ? 'green' : 'gray',
                  children: selectedRequest.status === 'CONFIRMED' ? 'Booking confirmed' : 'Confirmation pending'
                }
              ]}
            />
          </Card>

          {/* Basic Details */}
          <Descriptions title="Basic Information" bordered size="small" column={2}>
            <Descriptions.Item label="Destinations">{selectedRequest.destination}</Descriptions.Item>
            <Descriptions.Item label="Duration">{selectedRequest.duration}</Descriptions.Item>
            <Descriptions.Item label="Start Date">{dayjs(selectedRequest.start_date).format('DD MMM YYYY')}</Descriptions.Item>
            <Descriptions.Item label="Travelers">{selectedRequest.participants_count} person(s)</Descriptions.Item>
            <Descriptions.Item label="Budget Range">₹{selectedRequest.budget_range?.replace('-', ' - ₹')}</Descriptions.Item>
            <Descriptions.Item label="Tour Type">{selectedRequest.package_type}</Descriptions.Item>
            <Descriptions.Item label="Transportation">{selectedRequest.transportation_choice}</Descriptions.Item>
            <Descriptions.Item label="Hotel Preference">{selectedRequest.hotel_preference}</Descriptions.Item>
          </Descriptions>

          {/* Detailed Itinerary */}
          {detailedItinerary && (
            <>
              <Divider />
              <Title level={4}>Detailed Preferences</Title>
              
              {detailedItinerary.destinations && detailedItinerary.destinations.length > 0 && (
                <Card size="small" title="Destinations & Stay" style={{ marginBottom: '15px' }}>
                  {detailedItinerary.destinations.map((dest, index) => (
                    <div key={index} style={{ marginBottom: '10px', padding: '10px', background: 'var(--bg-secondary)', borderRadius: '8px' }}>
                      <Row gutter={[16, 8]}>
                        <Col span={12}><Text strong>City:</Text> {dest.city}</Col>
                        <Col span={12}><Text strong>Duration:</Text> {dest.stayDuration} days</Col>
                        <Col span={12}><Text strong>Hotel:</Text> {dest.hotelPreference}</Col>
                        <Col span={12}><Text strong>Room:</Text> {dest.roomType}</Col>
                        {dest.specialRequests && (
                          <Col span={24}><Text strong>Special Requests:</Text> {dest.specialRequests}</Col>
                        )}
                      </Row>
                    </div>
                  ))}
                </Card>
              )}

              {detailedItinerary.activities && detailedItinerary.activities.length > 0 && (
                <Card size="small" title="Preferred Activities" style={{ marginBottom: '15px' }}>
                  <Row gutter={[8, 8]}>
                    {detailedItinerary.activities.map((activity, index) => (
                      <Col key={index}>
                        <Tag color={activity.preference === 'must-have' ? 'red' : activity.preference === 'preferred' ? 'blue' : 'default'}>
                          {activity.name} ({activity.type})
                        </Tag>
                      </Col>
                    ))}
                  </Row>
                </Card>
              )}

              {(detailedItinerary.meal_preferences || detailedItinerary.group_composition || detailedItinerary.accessibility_needs) && (
                <Card size="small" title="Additional Preferences" style={{ marginBottom: '15px' }}>
                  <Row gutter={[16, 8]}>
                    {detailedItinerary.meal_preferences && (
                      <Col span={24}><Text strong>Meal Preferences:</Text> {detailedItinerary.meal_preferences.join(', ')}</Col>
                    )}
                    {detailedItinerary.group_composition && (
                      <Col span={24}><Text strong>Group Type:</Text> {detailedItinerary.group_composition.join(', ')}</Col>
                    )}
                    {detailedItinerary.accessibility_needs && (
                      <Col span={24}><Text strong>Accessibility:</Text> {detailedItinerary.accessibility_needs.join(', ')}</Col>
                    )}
                  </Row>
                </Card>
              )}
            </>
          )}

          {/* Admin Response */}
          {selectedRequest.admin_response && (
            <>
              <Divider />
              <Card 
                size="small" 
                title={<Space><MessageOutlined />Admin Response</Space>}
                style={{ background: 'var(--success-light)' }}
              >
                <Paragraph>{selectedRequest.admin_response}</Paragraph>
                {(selectedRequest.final_quoted_price || selectedRequest.quoted_price) && (
                  <div style={{ marginTop: '10px', padding: '10px', background: 'white', borderRadius: '8px' }}>
                    <Text strong style={{ color: 'var(--success-color)', fontSize: '18px' }}>
                      Quoted Price: ₹{Number(selectedRequest.final_quoted_price || selectedRequest.quoted_price).toLocaleString()}
                    </Text>
                    

                    {/* Customer Response Buttons */}
                    {selectedRequest.customer_response === 'PENDING' && (
                      <div style={{ marginTop: '15px', display: 'flex', gap: '10px' }}>
                        <Button 
                          type="primary" 
                          icon={<CheckCircleOutlined />} 
                          size="large"
                          onClick={() => setPaymentModalVisible(true)}
                        >
                          Accept & Pay 30% Advance
                        </Button>
                        
                        <Popconfirm
                          title="Reject Quote"
                          description="Are you sure you want to reject this quote? This will cancel the request."
                          onConfirm={() => handleCustomerResponse(selectedRequest.id, 'REJECTED')}
                          okText="Yes, Reject"
                          cancelText="Cancel"
                        >
                          <Button danger icon={<CloseCircleOutlined />} size="large">
                            Reject Quote
                          </Button>
                        </Popconfirm>
                      </div>
                    )}
                    
                    {/* Show customer response if already responded */}
                    {selectedRequest.customer_response !== 'PENDING' && (
                      <div style={{ marginTop: '15px' }}>
                        <Tag 
                          color={selectedRequest.customer_response === 'ACCEPTED' ? 'green' : 'red'} 
                          icon={selectedRequest.customer_response === 'ACCEPTED' ? <CheckCircleOutlined /> : <CloseCircleOutlined />}
                          style={{ fontSize: '14px', padding: '5px 10px' }}
                        >
                          Quote {selectedRequest.customer_response.toLowerCase()} on {dayjs(selectedRequest.customer_response_date).format('DD MMM YYYY')}
                        </Tag>
                      </div>
                    )}
                    
                    {/* Proceed to Payment */}
                    {selectedRequest.customer_response === 'ACCEPTED' && selectedRequest.status === 'CONFIRMED' && (
                      <div style={{ marginTop: '16px' }}>
                        <Button 
                          type="primary" 
                          icon={<CreditCardOutlined />} 
                          size="large"
                          onClick={() => setPaymentModalVisible(true)}
                        >
                          Proceed to Payment
                        </Button>
                        <div style={{ marginTop: 8, color: 'var(--text-secondary)' }}>
                          You will be redirected to My Bookings after payment.
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </Card>
            </>
          )}

          {selectedRequest.special_requirements && (
            <>
              <Divider />
              <Card size="small" title="Special Requirements">
                <Paragraph>{selectedRequest.special_requirements}</Paragraph>
              </Card>
            </>
          )}
        </div>
      </Modal>
    );
  };

  if (loading) {
    return (
      <div style={{ height: '80vh', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <Spin size="large" />
      </div>
    );
  }

  if (!user) {
    return (
      <div style={{ height: '80vh', display: 'flex', justifyContent: 'center', alignItems: 'center', flexDirection: 'column' }}>
        <Title level={3}>Please log in to view your custom requests</Title>
        <Button type="primary" onClick={() => navigate('/login')}>Go to Login</Button>
      </div>
    );
  }

  return (
    <div style={{ background: 'var(--bg-secondary)', minHeight: '100vh', padding: 'var(--spacing-3xl) 0' }}>
      <div className="container-xl" style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 var(--spacing-xl)' }}>
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          style={{ marginBottom: '30px' }}
        >
          <Title level={2} style={{ marginBottom: '10px' }}>My Custom Tour Requests</Title>
          <p style={{ color: 'var(--text-secondary)' }}>Track your custom tour requests and admin responses</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <Card className="card" bodyStyle={{ padding: '0' }}>
            <Table
              columns={columns}
              dataSource={requests}
              rowKey="id"
              pagination={{ pageSize: 10 }}
              locale={{ emptyText: <Empty description="No custom requests found" /> }}
            />
          </Card>
        </motion.div>

        {renderDetailModal()}
        <Modal
          open={paymentModalVisible}
          onCancel={() => setPaymentModalVisible(false)}
          footer={null}
          width={500}
          closeIcon={null}
          bodyStyle={{ padding: 0 }}
          style={{ top: 20 }}
        >
          <div style={{ 
            background: 'linear-gradient(135deg, var(--primary-color) 0%, var(--primary-dark) 100%)',
            padding: '30px',
            textAlign: 'center',
            color: 'white'
          }}>
            <div style={{ 
              width: 80, 
              height: 80, 
              background: 'rgba(255,255,255,0.2)', 
              borderRadius: '50%', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center', 
              margin: '0 auto 20px',
              backdropFilter: 'blur(10px)'
            }}>
              <LockOutlined style={{ fontSize: 40, color: 'white' }} />
            </div>
            <Title level={2} style={{ color: 'white', margin: '0 0 10px 0' }}>Secure Checkout</Title>
            <Text style={{ color: 'rgba(255,255,255,0.9)', fontSize: '16px' }}>
              Complete your booking with our secure payment system
            </Text>
          </div>

          <div style={{ padding: '30px' }}>
            <div style={{ 
              background: 'var(--bg-secondary)', 
              padding: '20px', 
              borderRadius: '12px', 
              marginBottom: '25px',
              border: '1px solid var(--border-color)'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                <Text strong style={{ fontSize: '16px' }}>Quote Summary</Text>
                <Tag color="blue">Advance Payment (30%)</Tag>
              </div>
              
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <Text type="secondary">Quoted Base:</Text>
                <Text>₹{Number(selectedRequest?.quoted_price || 0).toLocaleString()}</Text>
              </div>
              
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <Text type="secondary">GST (5%):</Text>
                <Text>₹{((Number(selectedRequest?.quoted_price || 0) * 0.05) || 0).toLocaleString()}</Text>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', opacity: 0.5 }}>
                <Text type="secondary">Total Package Cost:</Text>
                <Text>₹{(Number(selectedRequest?.quoted_price || 0) * 1.05).toLocaleString()}</Text>
              </div>

              <Divider style={{ margin: '15px 0' }} />
              
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text strong style={{ fontSize: '18px' }}>Required Advance (30%):</Text>
                <Text strong style={{ fontSize: '24px', color: 'var(--primary-color)' }}>
                  ₹{((Number(selectedRequest?.quoted_price || 0) * 1.05) * 0.3).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                </Text>
              </div>
            </div>

              <div style={{ 
                background: '#f6ffed', 
                border: '1px solid #b7eb8f', 
                borderRadius: '8px', 
                padding: '15px', 
                marginBottom: '20px' 
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                  <SafetyCertificateOutlined style={{ color: '#52c41a', fontSize: '18px' }} />
                  <Text strong style={{ color: '#52c41a' }}>Your payment is secure</Text>
                </div>
                <Text style={{ fontSize: '13px', color: '#666' }}>
                  • Processed securely by Razorpay<br/>
                  • Supports Credit/Debit Cards, UPI, Netbanking<br/>
                  • Your details are never stored on our servers
                </Text>
              </div>

              <Button 
                type="primary" 
                block 
                size="large" 
                onClick={processCustomPayment}
                loading={processingPayment} 
                style={{ 
                  height: 50, 
                  borderRadius: 12, 
                  fontSize: '16px',
                  fontWeight: 'bold',
                  background: 'linear-gradient(135deg, var(--primary-color) 0%, var(--primary-dark) 100%)',
                  border: 'none'
                }}
              >
                Pay Advance ₹{((Number(selectedRequest?.quoted_price || 0) * 1.05) * 0.3).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
              </Button>

              <div style={{ textAlign: 'center', marginTop: '15px' }}>
                <Text type="secondary" style={{ fontSize: '12px' }}>
                  By proceeding, you agree to our Terms & Conditions
                </Text>
              </div>
          </div>
        </Modal>
      </div>
    </div>
  );
};

export default MyCustomRequests;
