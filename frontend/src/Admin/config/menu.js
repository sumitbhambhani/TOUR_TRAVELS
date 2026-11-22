import {
    DashboardOutlined,
    UserOutlined,
    CompassOutlined,
    EnvironmentOutlined,
    HomeOutlined,
    CarOutlined,
    UnorderedListOutlined,
    DollarOutlined,
    TagsOutlined,
    FormOutlined,
    CreditCardOutlined,
    TransactionOutlined,
    StarOutlined,
    MessageOutlined,
    FileTextOutlined,
    BarChartOutlined,
} from '@ant-design/icons';

/**
 * Admin sidebar menu configuration
 * Each item can have sub-items for nested navigation
 */
export const adminMenuItems = [
    {
        key: '/admin',
        icon: DashboardOutlined,
        label: 'Dashboard',
        path: '/admin',
    },
    {
        key: 'users',
        icon: UserOutlined,
        label: 'User Management',
        path: '/admin/users',
    },
    {
        key: 'tour-management',
        icon: CompassOutlined,
        label: 'Tour Management',
        children: [
            {
                key: '/admin/tours',
                label: 'Tour Packages',
                path: '/admin/tours',
            },
            {
                key: '/admin/destinations',
                label: 'Destinations',
                path: '/admin/destinations',
            },
            {
                key: '/admin/hotels',
                label: 'Hotels',
                path: '/admin/hotels',
            },
            {
                key: '/admin/vehicles',
                label: 'Vehicles',
                path: '/admin/vehicles',
            },
            {
                key: '/admin/itineraries',
                label: 'Itineraries',
                path: '/admin/itineraries',
            },
        ],
    },
    {
        key: '/admin/bookings',
        icon: UnorderedListOutlined,
        label: 'Booking Management',
        path: '/admin/bookings',
    },
    {
        key: 'offers-seasons',
        icon: TagsOutlined,
        label: 'Offers & Seasons',
        children: [
            {
                key: '/admin/offers',
                label: 'Offers & Discounts',
                path: '/admin/offers',
            },
            {
                key: '/admin/seasons',
                label: 'Seasons',
                path: '/admin/seasons',
            },
        ],
    },
    {
        key: '/admin/custom-packages',
        icon: FormOutlined,
        label: 'Custom Packages',
        path: '/admin/custom-packages',
    },
    {
        key: '/admin/pricing-config',
        icon: DollarOutlined,
        label: 'Pricing Config',
        path: '/admin/pricing-config',
    },
    {
        key: 'payments-refunds',
        icon: CreditCardOutlined,
        label: 'Payments & Refunds',
        children: [
            {
                key: '/admin/payments',
                label: 'Payments',
                path: '/admin/payments',
            },
            {
                key: '/admin/refunds',
                label: 'Refunds',
                path: '/admin/refunds',
            },
            {
                key: '/admin/invoices',
                label: 'Invoices',
                path: '/admin/invoices',
            },
        ],
    },
    {
        key: 'reviews-inquiries',
        icon: StarOutlined,
        label: 'Reviews & Inquiries',
        children: [
            {
                key: '/admin/reviews',
                label: 'Reviews',
                path: '/admin/reviews',
            },
            {
                key: '/admin/inquiries',
                label: 'Inquiries',
                path: '/admin/inquiries',
            },
        ],
    },
    {
        key: 'reports',
        icon: BarChartOutlined,
        label: 'Reports & Analytics',
        children: [
            {
                key: '/admin/reports/dashboard',
                label: 'Dashboard & Charts',
                path: '/admin/reports/dashboard',
            },
            {
                key: '/admin/reports/bookings',
                label: 'Booking Report',
                path: '/admin/reports/bookings',
            },
            {
                key: '/admin/reports/order-types',
                label: 'Order Type Report',
                path: '/admin/reports/order-types',
            },
            {
                key: '/admin/reports/top-tours',
                label: 'Most Booked Tours',
                path: '/admin/reports/top-tours',
            },
        ],
    },
];

export default adminMenuItems;
