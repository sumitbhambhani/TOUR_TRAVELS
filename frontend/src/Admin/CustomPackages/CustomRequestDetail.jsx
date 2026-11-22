import React, { useState, useEffect } from 'react';
import { Row, Col, Card, Descriptions, Tag, Button, Spin, Empty, Form, Input, Select, InputNumber, Divider, message, Alert, Space } from 'antd';
import { ArrowLeftOutlined, CalculatorOutlined } from '@ant-design/icons';
import { useParams, useNavigate } from 'react-router-dom';
import apiClient from '../../lib/apiClient';
import { endpoints } from '../../constant/ENDPOINTS';

const { Option } = Select;
const { TextArea } = Input;

const CustomRequestDetail = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    
    // States
    const [packageData, setPackageData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [calculating, setCalculating] = useState(false);
    const [hotels, setHotels] = useState([]);
    const [carConfigs, setCarConfigs] = useState([]);
    
    // Forms
    const [calcForm] = Form.useForm();
    const [generatedPreview, setGeneratedPreview] = useState(null);

    // Initial Fetch
    useEffect(() => {
        fetchPackageData();
        fetchHotels();
        fetchCarConfigs();
    }, [id]);

    const fetchPackageData = async () => {
        try {
            setLoading(true);
            const res = await apiClient.get(endpoints.GET_ADMIN_CUSTOM_PACKAGE_DETAIL(id));
            setPackageData(res.data);
            
            // Auto fill form if it was already processed
            if (res.data.admin_kms_distance) calcForm.setFieldValue('admin_kms_distance', res.data.admin_kms_distance);
            if (res.data.admin_direct_travel_price) calcForm.setFieldValue('admin_direct_travel_price', res.data.admin_direct_travel_price);
            if (res.data.admin_response) calcForm.setFieldValue('admin_response', res.data.admin_response);
            if (res.data.quotation_breakdown?.accommodation?.selected_hotel_id) {
                calcForm.setFieldValue('admin_selected_hotel', res.data.quotation_breakdown.accommodation.selected_hotel_id);
            }
            if (res.data.quotation_breakdown) setGeneratedPreview(res.data.quotation_breakdown);
        } catch (error) {
            message.error('Failed to load package details');
        } finally {
            setLoading(false);
        }
    };

    const fetchHotels = async () => {
        try {
            const res = await apiClient.get(endpoints.GET_HOTEL_PRICING_CONFIGS);
            const data = res.data?.results || res.data?.data || res.data || [];
            setHotels(Array.isArray(data) ? data.filter(h => h.is_active !== false) : []);
        } catch (error) {
            console.error('Failed to load hotels from pricing config');
        }
    };

    const fetchCarConfigs = async () => {
        try {
            const res = await apiClient.get(endpoints.GET_CAR_PRICING_CONFIGS);
            const data = res.data?.results || res.data?.data || res.data || [];
            setCarConfigs(data.filter(c => c.is_active));
        } catch (error) {
            console.error('Failed to load car configs for dropdown');
        }
    };

    // --- Derived values (computed from packageData, safe when null) ---
    const isTransportCar = packageData?.transportation_choice?.toLowerCase() === 'car';
    const isTransportOther = ['flight', 'train'].includes(packageData?.transportation_choice?.toLowerCase());
    
    const hasDirectHotelPref = packageData?.hotel_preference && packageData.hotel_preference.toLowerCase() !== 'none' && packageData.hotel_preference !== '';
    let hasDestinationHotelPref = false;
    let destinationHotelInfo = '';
    if (packageData) {
        try {
            const itinerary = typeof packageData.detailed_itinerary === 'string' ? JSON.parse(packageData.detailed_itinerary) : packageData.detailed_itinerary;
            if (itinerary?.destinations) {
                const destWithHotel = itinerary.destinations.find(d => d.hotelPreference);
                if (destWithHotel) {
                    hasDestinationHotelPref = true;
                    destinationHotelInfo = `${destWithHotel.hotelPreference}${destWithHotel.roomType ? ' / ' + destWithHotel.roomType : ''}`;
                }
            }
        } catch (e) { /* ignore parse errors */ }
    }
    
    const needsHotel = (hasDirectHotelPref || hasDestinationHotelPref || ((packageData?.total_nights || 0) > 0));
    const customerHotelDisplay = hasDirectHotelPref ? packageData.hotel_preference : (destinationHotelInfo || 'Not specified');

    // Extract exactly what tier should be used based on the hierarchy of customer selection
    const custTier = hasDirectHotelPref ? packageData.hotel_preference : '';
    const custRoom = packageData?.room_type || '';
    
    let resolvedTier = custTier;
    let resolvedRoom = custRoom;
    if (!resolvedTier && packageData) {
        try {
            const itin = typeof packageData.detailed_itinerary === 'string' ? JSON.parse(packageData.detailed_itinerary) : packageData.detailed_itinerary;
            const dh = itin?.destinations?.find(d => d.hotelPreference);
            if (dh) { resolvedTier = dh.hotelPreference; resolvedRoom = dh.roomType || ''; }
        } catch (e) { /* ignore */ }
    }

    // Map customer room type to pricing config room type
    const mapRoomType = (customerRoom) => {
        const mapping = { 'single': 'Doublesharing', 'double': 'Doublesharing', 'triple': 'triplesharing', 'villa': 'Doublesharing' };
        return mapping[(customerRoom || '').toLowerCase()] || 'Doublesharing';
    };

    const handleGenerateQuote = async (values) => {
        try {
            setCalculating(true);
            const payload = { ...values };
            
            if (resolvedTier && needsHotel) {
                payload.admin_confirmed_hotel_tier = resolvedTier;
                payload.admin_confirmed_room_type = mapRoomType(resolvedRoom);
            }
            
            const res = await apiClient.post(endpoints.ENTER_CUSTOM_PACKAGE_PARAMETERS(id), payload);
            message.success(res.data.message || 'Quotation Generated Successfully');
            
            setGeneratedPreview(res.data.breakdown);
            fetchPackageData();
        } catch (error) {
            if (error.response?.data?.error) {
                message.error(`Calculation Failed: ${error.response.data.error}`);
            } else if (error.response?.data) {
                const errorMsg = Object.values(error.response.data).flat().join(', ');
                message.error(`Validation Failed: ${errorMsg}`);
            } else {
                message.error('Failed to generate quotation');
            }
        } finally {
            setCalculating(false);
        }
    };

    const handleUpdateStatus = async (status) => {
        try {
            await apiClient.patch(endpoints.UPDATE_CUSTOM_PACKAGE_STATUS(id), { status });
            message.success('Status updated');
            fetchPackageData();
        } catch (error) {
            message.error('Failed to update status');
        }
    };

    if (loading) return <div style={{ textAlign: 'center', padding: '50px' }}><Spin size="large" /></div>;
    if (!packageData) return <Empty description="Package Request Not Found" />;
    
    return (
        <div style={{ padding: '24px' }}>
            <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/admin/custom-packages')} style={{ marginBottom: '16px' }}>
                Back to Requests
            </Button>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <h1 style={{ margin: 0 }}>Custom Request #{String(packageData.id).substring(0,8)}</h1>
                <Space>
                    <Tag color={packageData.status === 'QUOTED' ? 'purple' : packageData.status === 'CONFIRMED' ? 'green' : packageData.status === 'CANCELLED' ? 'red' : 'blue'} style={{ fontSize: '14px', padding: '4px 12px' }}>
                        {packageData.status}
                    </Tag>
                    {packageData.customer_response && packageData.customer_response !== 'PENDING' && (
                        <Tag color={packageData.customer_response === 'ACCEPTED' ? 'green' : 'red'} style={{ fontSize: '14px', padding: '4px 12px' }}>
                            Customer: {packageData.customer_response}
                        </Tag>
                    )}
                </Space>
            </div>

            <Row gutter={[24, 24]}>
                {/* Left Panel - Request Details */}
                <Col xs={24} lg={12}>
                    <Card title="User Request Details" style={{ height: '100%' }}>
                        <Descriptions column={1} bordered size="small">
                            <Descriptions.Item label="Customer">
                                {packageData.customer_display_name || packageData.customer_name} <br/>
                                <a href={`mailto:${packageData.customer_display_email || packageData.customer_email}`}>
                                    {packageData.customer_display_email || packageData.customer_email}
                                </a>
                            </Descriptions.Item>
                            <Descriptions.Item label="Contact">{packageData.contact_number}</Descriptions.Item>
                            <Descriptions.Item label="From City">{packageData.from_city}</Descriptions.Item>
                            <Descriptions.Item label="Destination">{packageData.destination}</Descriptions.Item>
                            <Descriptions.Item label="Duration">
                                {packageData.duration} ({packageData.total_nights} Nights)
                            </Descriptions.Item>
                            <Descriptions.Item label="Start Date">{packageData.start_date}</Descriptions.Item>
                            <Descriptions.Item label="Participants">{packageData.participants_count}</Descriptions.Item>
                            <Descriptions.Item label="Transport">
                                <Tag>{packageData.transportation_choice || 'N/A'}</Tag>
                            </Descriptions.Item>
                            <Descriptions.Item label="Hotel Preference">
                                <Tag color={customerHotelDisplay !== 'Not specified' ? 'blue' : 'default'}>{customerHotelDisplay}</Tag>
                            </Descriptions.Item>
                            <Descriptions.Item label="Room Preference">
                                {packageData.room_type || 'N/A'}
                            </Descriptions.Item>
                            <Descriptions.Item label="Budget">{packageData.budget_range}</Descriptions.Item>
                        </Descriptions>

                        {/* Show confirmed hotel tier/room type if already set */}
                        {(packageData.admin_confirmed_hotel_tier || packageData.admin_confirmed_room_type) && (
                            <div style={{ marginTop: '16px', padding: '12px', background: '#f6ffed', borderRadius: '8px', border: '1px solid #b7eb8f' }}>
                                <h4 style={{ margin: '0 0 8px 0', color: '#389e0d' }}>Admin Confirmed Hotel</h4>
                                <div><strong>Tier:</strong> {packageData.admin_confirmed_hotel_tier}</div>
                                <div><strong>Room Type:</strong> {packageData.admin_confirmed_room_type}</div>
                            </div>
                        )}
                        
                        {packageData.special_requirements && (
                            <div style={{ marginTop: '16px' }}>
                                <h4>Special Requirements</h4>
                                <div style={{ padding: '12px', background: '#f5f5f5', borderRadius: '4px' }}>
                                    {packageData.special_requirements}
                                </div>
                            </div>
                        )}
                    </Card>
                </Col>

                {/* Right Panel - Quotation Engine */}
                <Col xs={24} lg={12}>
                    <Card title="Quotation Engine" style={{ height: '100%' }}>
                        
                        <Alert 
                           message="Automated Calculation" 
                           description="The system automatically adds a 20% margin to the base cost calculated below. You only need to provide the operational parameters." 
                           type="info" 
                           showIcon 
                           style={{ marginBottom: '24px' }} 
                        />

                        <Form 
                            form={calcForm} 
                            layout="vertical" 
                            onFinish={handleGenerateQuote}
                            disabled={['CONFIRMED', 'CANCELLED'].includes(packageData.status)}
                        >
                            <Row gutter={16}>
                                {/* Conditional Transport Params */}
                                {isTransportCar && (
                                    <>
                                        <Col span={24}>
                                            <Form.Item 
                                                name="admin_selected_car_config" 
                                                label="Select Car Rate"
                                                rules={[{ required: true, message: 'Please select a car rate' }]}
                                            >
                                                <Select placeholder="Select Car Rate">
                                                    {carConfigs.map(c => (
                                                        <Option key={c.id} value={c.id}>
                                                            ₹{c.price_per_km}/km {c.description ? `— ${c.description}` : ''}
                                                        </Option>
                                                    ))}
                                                </Select>
                                            </Form.Item>
                                        </Col>
                                        <Col span={24}>
                                            <Form.Item 
                                                name="admin_kms_distance" 
                                                label="Estimated KMs Distance"
                                                rules={[{ required: true, message: 'Please input KMs' }]}
                                            >
                                                <InputNumber min={1} style={{ width: '100%' }} placeholder="e.g. 500" />
                                            </Form.Item>
                                        </Col>
                                    </>
                                )}

                                {isTransportOther && (
                                    <Col span={24}>
                                        <Form.Item 
                                            name="admin_direct_travel_price" 
                                            label={`Direct Travel Cost (${packageData.transportation_choice})`}
                                            rules={[{ required: true, message: 'Please input direct cost' }]}
                                        >
                                            <InputNumber min={0} style={{ width: '100%' }} prefix="₹" />
                                        </Form.Item>
                                    </Col>
                                )}

                                {/* Hotel Params - show for overnight trips */}
                                {needsHotel && (
                                    <>
                                        <Col span={24}>
                                            <Divider style={{ margin: '8px 0 16px' }}>Accommodation</Divider>
                                        </Col>
                                        
                                        {/* Read-only customer preferences */}
                                        <Col span={24}>
                                            <div style={{ 
                                                background: '#fff7e6', 
                                                border: '1px solid #ffd591', 
                                                borderRadius: '8px', 
                                                padding: '12px 16px',
                                                marginBottom: '16px'
                                            }}>
                                                <div style={{ fontWeight: 'bold', marginBottom: '8px', color: '#d46b08' }}>
                                                    Customer's Hotel Preferences (Read Only)
                                                </div>
                                                <Row gutter={16}>
                                                    <Col span={8}>
                                                        <div style={{ color: '#888', fontSize: '12px' }}>Hotel Tier</div>
                                                        <Tag color="blue" style={{ marginTop: '4px' }}>
                                                            {customerHotelDisplay || 'Not specified'}
                                                        </Tag>
                                                    </Col>
                                                    <Col span={8}>
                                                        <div style={{ color: '#888', fontSize: '12px' }}>Room Type</div>
                                                        <Tag color="purple" style={{ marginTop: '4px' }}>
                                                            {packageData.room_type || 'Not specified'}
                                                        </Tag>
                                                    </Col>
                                                    <Col span={8}>
                                                        <div style={{ color: '#888', fontSize: '12px' }}>Stay Details</div>
                                                        <Tag style={{ marginTop: '4px' }}>
                                                            {packageData.total_nights} Night(s), {packageData.participants_count} Person(s)
                                                        </Tag>
                                                    </Col>
                                                </Row>
                                            </div>
                                        </Col>

                                        {/* Admin selects a hotel from the available list */}
                                        <Col span={24}>
                                            <Form.Item 
                                                name="admin_selected_hotel" 
                                                label="Allocate Hotel"
                                                help={resolvedTier ? `Showing hotels matching tier: ${resolvedTier}` : ''}
                                            >
                                                <Select 
                                                    placeholder="Select a hotel to allocate" 
                                                    allowClear
                                                    showSearch
                                                    optionFilterProp="children"
                                                >
                                                    {hotels
                                                        .filter(h => {
                                                            // Filter by location
                                                            if (packageData.destination && h.location) {
                                                                const destinations = packageData.destination.toLowerCase().split(',').map(d => d.trim());
                                                                const hotelLoc = h.location.toLowerCase();
                                                                // Allow if hotel location matches any of the requested destinations
                                                                const locationMatch = destinations.some(dest => hotelLoc.includes(dest) || dest.includes(hotelLoc));
                                                                if (!locationMatch) return false;
                                                            }

                                                            // Filter by Tier
                                                            if (!resolvedTier) return true;
                                                            const tierLower = resolvedTier.toLowerCase();
                                                            
                                                            // Match 3-star, 4-star, 5-star etc.
                                                            if (tierLower.includes('star')) {
                                                                const starMatch = tierLower.match(/(\d)/);
                                                                if (starMatch && h.star_rating) {
                                                                    return h.star_rating.toString() === starMatch[1];
                                                                }
                                                            }
                                                            
                                                            // Match by type like 'resort', 'boutique', 'budget'
                                                            if (h.hotel_tier && tierLower.includes(h.hotel_tier.toLowerCase())) {
                                                                return true;
                                                            }
                                                            
                                                            // If we can't find a direct match, show all for safety so admin isn't blocked, 
                                                            // but ideally we only return matches. We'll be strict if there's a star rating match strategy.
                                                            if (tierLower.includes('star')) {
                                                                return false; // Strict filter for stars
                                                            }
                                                            
                                                            return true; // Fallback for other non-star tiers to let admin decide
                                                        })
                                                        .map(h => (
                                                        <Option key={h.id} value={h.id}>
                                                            {h.hotel_name} — {h.location} — {h.hotel_tier} ({h.room_type}) — ₹{h.price_per_night}/night
                                                        </Option>
                                                    ))}
                                                </Select>
                                            </Form.Item>
                                        </Col>
                                    </>
                                )}

                                {/* Admin Response Message */}
                                <Col span={24}>
                                    <Divider style={{ margin: '8px 0 16px' }} />
                                    <Form.Item 
                                        name="admin_response" 
                                        label="Message to Customer (sent with quote)"
                                    >
                                        <TextArea 
                                            rows={3} 
                                            placeholder="Write a message to the customer about this quote..." 
                                        />
                                    </Form.Item>
                                </Col>
                            </Row>

                            <Button 
                                type="primary" 
                                htmlType="submit" 
                                icon={<CalculatorOutlined />} 
                                loading={calculating}
                                block
                                size="large"
                            >
                                Calculate & Generate Quote
                            </Button>
                        </Form>

                        <Divider />

                        {generatedPreview && (
                            <div>
                                <h3 style={{ marginBottom: '16px' }}>Quotation Breakdown</h3>
                                
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '15px' }}>
                                    
                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                        <span>Travel Cost ({generatedPreview.transportation?.type})</span>
                                        <strong>₹{generatedPreview.transportation?.total_travel_cost}</strong>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', color: '#888', fontSize: '13px' }}>
                                        {generatedPreview.transportation?.type === 'car' ? (
                                            <span>&nbsp;&nbsp;Rate: ₹{generatedPreview.transportation.price_per_km}/km × {generatedPreview.transportation.kms_distance} km</span>
                                        ) : (
                                            <span>&nbsp;&nbsp;Rate: ₹{generatedPreview.transportation?.direct_price_per_person}/person × {generatedPreview.summary?.participants} travelers</span>
                                        )}
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                        <span>
                                            Hotel Cost ({generatedPreview.accommodation?.nights}N × {generatedPreview.summary?.participants} Travelers)
                                        </span>
                                        <strong>₹{generatedPreview.accommodation?.total_hotel_cost}</strong>
                                    </div>
                                    {generatedPreview.accommodation?.selected_hotel_name && (
                                        <div style={{ display: 'flex', justifyContent: 'space-between', color: '#888', fontSize: '13px' }}>
                                            <span>&nbsp;&nbsp;Allocated Hotel: {generatedPreview.accommodation.selected_hotel_name}</span>
                                        </div>
                                    )}
                                    <div style={{ display: 'flex', justifyContent: 'space-between', color: '#888', fontSize: '13px' }}>
                                        <span>&nbsp;&nbsp;Rate: ₹{generatedPreview.accommodation?.price_per_night}/person/night</span>
                                    </div>
                                    
                                    <Divider style={{ margin: '8px 0' }} />

                                    <div style={{ display: 'flex', justifyContent: 'space-between', color: '#666', background: '#fafafa', padding: '4px' }}>
                                        <span>Base Cost (Per Person)</span>
                                        <span>₹{generatedPreview.summary?.base_cost_per_person}</span>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', color: '#666' }}>
                                        <span>Total Base Cost ({generatedPreview.summary?.participants} travelers)</span>
                                        <span>₹{generatedPreview.summary?.total_base_cost}</span>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', color: '#666' }}>
                                        <span>Platform Margin (20%)</span>
                                        <span>₹{generatedPreview.summary?.margin_20_percent}</span>
                                    </div>
                                    
                                    <div style={{ 
                                        display: 'flex', 
                                        justifyContent: 'space-between', 
                                        background: '#f6ffed', 
                                        padding: '12px', 
                                        borderRadius: '8px',
                                        marginTop: '12px',
                                        border: '1px solid #b7eb8f'
                                    }}>
                                        <span style={{ fontSize: '16px', fontWeight: 'bold', color: '#389e0d' }}>Final Quoted Price</span>
                                        <span style={{ fontSize: '18px', fontWeight: 'bold', color: '#389e0d' }}>
                                            ₹{generatedPreview.summary?.final_quoted_price}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Status Controls */}
                        {packageData.status === 'QUOTED' && (
                             <div style={{ marginTop: '24px', textAlign: 'center' }}>
                                 <p style={{ color: '#888' }}>Waiting for customer response. You can act on their behalf if needed:</p>
                                 <Space>
                                    <Button onClick={() => handleUpdateStatus('CONFIRMED')} style={{ borderColor: 'green', color: 'green' }}>Mark Confirmed</Button>
                                    <Button danger onClick={() => handleUpdateStatus('CANCELLED')}>Mark Cancelled</Button>
                                 </Space>
                             </div>
                        )}
                        
                    </Card>
                </Col>
            </Row>
        </div>
    );
};

export default CustomRequestDetail;
